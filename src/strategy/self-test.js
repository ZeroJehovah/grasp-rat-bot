'use strict';

/**
 * Strategy Module Self-Tests
 *
 * Tests for the extracted strategy modules to ensure correctness.
 */

const { ACTION_PRIORITY_BANDS, getActionPriorityBand, buildActionFocus } = require('./action-priority');
const {
  applyFinalActionArbitration,
  applyFinalActionArbitrationCore
} = require('./action-arbitration');
const { buildFinalActionCandidate, selectFinalActionCandidateCore } = require('./final-candidate-selection');
const {
  evaluateAimPointReachabilityCore,
  quadraticInterceptCore,
  solveInterceptAtCreationCore
} = require('./combat-aim');
const {
  arrivalOccupancyModelCore,
  buildTrajectoryCoveragePlanCore,
  buildTrajectoryPathsCore,
  dynamicBehaviorTrajectoryEligibilityCore,
  movingTargetStopRouteRejectedCore,
  selectRobustTrajectoryAimCore,
  shouldApplyTrajectoryCoverageCore,
  shotCorridorMissCore,
  trajectoryCoverageRouteReliabilityCore
} = require('./combat-shot-coverage');
const {
  classifyFireRiskCore,
  determineCombatFireState,
  evaluateCombatFireBudgetCore,
  evaluateHighEntropyFireGateCore,
  resolveEstablishedCombatFireAuthorizationCore,
  updateCloseBandReserveCore,
  updateCombatProbePhaseCore
} = require('./combat-fire-discipline');
const {
  applyCombatMovementModifiers,
  calculateDodgeDirection,
  classifyDistanceAwareDodgeModeCore,
  createSeededRandomCore,
  currentProspectiveReactionSlackCore,
  deriveCombatReactionBudgetCore,
  predictNextFireWindowCore,
  contactEntryRiskCore,
  contactEntrySyntheticBulletCore,
  pickSafeClosingDodgeCore,
  resolveDistanceAwareDodgeCore,
  selectStochasticDodgeCandidateCore,
  safeRetreatInterceptCandidateCore,
  selectCombatMovementArbitrationCore,
  rewardFinishBackAwaySuppressionPolicy
} = require('./combat-movement');
const {
  profitEscortContinuityMatchesCore,
  selectProfitEscortDirectionCore,
  updateProfitEscortContinuityCore
} = require('./profit-escort');
const {
  recoveryApproachStaminaBudgetForHp,
  recoveryEquivalentDropForHp,
  recoveryPriorityDecision
} = require('./recovery-profit-priority');
const {
  classifyCombatTargetRole,
  dualTargetFireArbitration,
  incomingPressureEvidencePolicy,
  primaryFinishRaceAuthorization,
  primaryRewardSurvivalRacePolicy,
  secondaryCadenceMs,
  secondaryCombatExitPolicy,
  secondaryClosePressurePolicy,
  secondaryFirePolicy,
  secondaryRetentionPolicy
} = require('./dual-target-policy');
const { evaluateCoverCandidateCore } = require('./dual-target-cover');
const {
  resolveDodgeOwnershipCore,
  selectCombatMovementOwnerCore
} = require('./combat-movement-ownership');
const {
  observeProfitCompetitorEvidence,
  profitKillRacePolicy
} = require('./profit-kill-race');
const { runCombatHpLossAttributionSelfTest } = require('./combat-hp-loss-attribution');
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
const {
  activeCoinCompetitionCore,
  activeCoinPickupCompetitionCore
} = require('./coin-competition');
const {
  coinAxisLockShouldHoldCore,
  coinDirectionToCore,
  coinMotionMetaCore,
  coinPickupJitterAllowedCore,
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
  coinRouteSkipsHeldSingleCoinCore,
  closerCoinRouteForFirstTargetCore,
  selectCoinRouteCandidatePoolCore,
  pickCoinRouteOpportunityCore
} = require('./coin-route');
const {
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityMatchesChoiceCore,
  opportunityNetRoiCore,
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
const {
  DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM,
  evaluateCenterActivityHardBoundaryCore,
  highValueCoinTargetForActionCore
} = require('./center-activity-boundary');
const { patrolDirectionCore } = require('./patrol');
const {
  postAttackVisibleCoinExistsCore,
  postAttackCoinMatchesAttackCore,
  pickPostAttackDropCoinCore,
  pickPostAttackDropWaitTargetCore
} = require('./post-attack-drop');
const {
  EVASIVE_AIM_STRATEGIES,
  applyEvasiveAimStrategyCore,
  buildKnnFeatures,
  createEvasiveAimModel,
  highConfidenceEvasiveBehaviorCore,
  predictEvasiveAimAngles,
  updateEvasiveAimExperimentCore
} = require('./evasive-aim-experiment');
const EVASIVE_AIM_TEST_MODEL = createEvasiveAimModel(require('./evasive-aim-model.json'));
const {
  ownDamageSettlementEvidenceCore,
  updatePostKillSettlementCore,
  updatePostKillSettlementsCore,
  postKillEvidenceKey
} = require('./post-kill-settlement');
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
  combatBallisticCloseCore,
  combatDamageEfficiencyThresholdCore,
  combatEfficiencyWindowCore,
  combatPressurePhaseCore,
  combatPressureStrafeCore,
  combatPressureTargetRangeCore
} = require('./combat-pressure');
const { lootRacePositioningCore } = require('./loot-race-positioning');
const {
  updateCombatResponsePolicyShadowCore
} = require('./combat-response-policy-shadow');
const {
  combatEdgePressureDecisionCore,
  combatEscapeDecisionCore,
  combatTargetAdmissionCore,
  checkProactiveActiveCombatGates,
  incomingBulletHasCollisionRiskCore,
  incomingBulletRequiresTargetSwitchCore,
  applyCombatTargetSwitchHysteresisCore,
  combatTargetIncomingThreatEvidenceCore,
  combatTargetThreatAdvantageCore,
  pickEngagedCombatTargetCore,
  proactiveActiveProfitEligible,
  recentAfkAttackCommitmentCore
} = require('./combat-target-selection');
const {
  evaluateEconomicCooldownReentryCore,
  evaluateNonThreatCombatEconomicStopLossCore
} = require('./combat-economic-stop-loss');
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
const {
  centerActivityAfkContinuationFreshnessMsCore,
  deriveCenterActivityAfkContinuationCore,
  evaluateCenterActivityAfkAdmissionCore
} = require('./center-activity-afk');
const {
  dynamicWhitelistCombatRangeCore,
  dynamicWhitelistIncomingOverrideCore,
  evaluateDynamicWhitelistContactCore
} = require('./dynamic-whitelist-safety');
const { runRemoteProfitTargetsSelfTest } = require('./remote-profit-targets-self-test');
const {
  runLoginPointReloginShortcutSelfTest
} = require('./login-point-relogin-shortcut-self-test');
const { playerProfitScoreMultiplierCore } = require('./player-profit-score');

function runStrategyModuleSelfTests() {
  const results = [];

  const recoveryCurve = [
    [40, 100],
    [50, 100],
    [65, 70],
    [80, 40],
    [90, 40]
  ];
  results.push({
    name: 'recovery-profit-priority-linear-hp-curve',
    passed: recoveryCurve.every(([hp, expected]) => recoveryEquivalentDropForHp(hp) === expected)
  });
  results.push({
    name: 'recovery-profit-priority-compares-equivalent-drop',
    passed: recoveryPriorityDecision(
      { hp: 50 },
      { choice: { sourceTarget: { drop: 101 } } },
      { kind: 'recover' }
    ).recoveryWins === false
      && recoveryPriorityDecision(
        { hp: 80 },
        { choice: { sourceTarget: { drop: 40 } } },
        { kind: 'recover' }
      ).recoveryWins === true
  });
  results.push({
    name: 'recovery-profit-priority-low-hp-approach-budget-curve',
    passed: recoveryApproachStaminaBudgetForHp(30) === 75000
      && recoveryApproachStaminaBudgetForHp(50) === 75000
      && recoveryApproachStaminaBudgetForHp(65) === 112500
      && recoveryApproachStaminaBudgetForHp(80) === null
      && recoveryApproachStaminaBudgetForHp(100) === null
      && recoveryApproachStaminaBudgetForHp(undefined) === null
      && recoveryApproachStaminaBudgetForHp(50, {
        recoveryPriorityLowHpApproachStaminaMilli: 12000,
        recoveryPriorityHighHpApproachStaminaMilli: 40000
      }) === 12000
  });
  // 低血量下长途接近被打断会全额沉没体力: 超预算时必须先恢复。
  const richFarTarget = { choice: { sourceTarget: { drop: 526 }, staminaCost: 113534 } };
  const expensiveApproachAtLowHp = recoveryPriorityDecision({ hp: 46 }, richFarTarget, { kind: 'recover' });
  results.push({
    name: 'recovery-profit-priority-low-hp-approach-cost-gate',
    passed: expensiveApproachAtLowHp.recoveryWins === true
      && expensiveApproachAtLowHp.approachTooExpensive === true
      && expensiveApproachAtLowHp.hardGate === true
      && expensiveApproachAtLowHp.approachStaminaCost === 113534
      && expensiveApproachAtLowHp.approachStaminaBudget === 75000
      && expensiveApproachAtLowHp.reason === 'recovery-priority-low-hp-approach-cost'
      && expensiveApproachAtLowHp.action.recoveryPriority.reason === 'recovery-priority-low-hp-approach-cost'
      // 预算内的常规接近仍然按收益优先, 不改变原有行为。
      // 敌人接近成本 = 约 31700ms 交战固定量 + 距离(cm), 常见 47000~62000 必须放行。
      && recoveryPriorityDecision(
        { hp: 46 },
        { choice: { sourceTarget: { drop: 526 }, staminaCost: 61700 } },
        { kind: 'recover' }
      ).recoveryWins === false
      && recoveryPriorityDecision(
        { hp: 46 },
        { choice: { sourceTarget: { drop: 526 }, staminaCost: 75000 } },
        { kind: 'recover' }
      ).recoveryWins === false
      // 接近成本未知时不拦截, 避免把缺数据当成高成本。
      && recoveryPriorityDecision({ hp: 46 }, { choice: { sourceTarget: { drop: 526 } } }, { kind: 'recover' })
        .recoveryWins === false
      // 血量回到高位后不再限制接近距离。
      && recoveryPriorityDecision({ hp: 85 }, richFarTarget, { kind: 'recover' }).recoveryWins === false
      && recoveryPriorityDecision({ hp: 85 }, richFarTarget, { kind: 'recover' }).approachStaminaBudget === null
      // 恢复本来就占优时保留原有理由, 不被新门槛改写。
      && recoveryPriorityDecision(
        { hp: 46 },
        { choice: { sourceTarget: { drop: 10 }, staminaCost: 113534 } },
        { kind: 'recover' }
      ).reason === 'recovery-priority-at-or-above-profit'
  });

  const primaryRole = classifyCombatTargetRole({ user_id: 7 }, { targetId: 7 });
  const secondaryRole = classifyCombatTargetRole({ user_id: 8 }, { targetId: 7 });
  const whitelistRole = classifyCombatTargetRole({ user_id: 7, profitProtected: true }, { targetId: 7 });
  const defensiveWithoutMissionRole = classifyCombatTargetRole({ user_id: 8 }, null);
  const implicitProfitPrimaryRole = classifyCombatTargetRole({
    user_id: 8,
    profitPrimaryTarget: true
  }, null);
  results.push({
    name: 'dual-target-role-primary-secondary-and-whitelist-boundaries',
    passed: primaryRole.role === 'primary'
      && primaryRole.secondaryTarget === false
      && secondaryRole.role === 'secondary'
      && secondaryRole.primaryTargetId === '7'
      && whitelistRole.role === 'secondary'
      && whitelistRole.whitelisted === true
      && defensiveWithoutMissionRole.role === 'secondary'
      && implicitProfitPrimaryRole.role === 'primary'
      && implicitProfitPrimaryRole.implicitProfitPrimary === true
  });

  const secondarySamples = [
    { at: 7000, newBulletCount: 1, selfHp: 70 },
    { at: 9000, newBulletCount: 1, selfHp: 67 }
  ];
  const secondaryAllowed = secondaryFirePolicy({
    nowMs: 10000,
    combatTargetState: { noDamageMs: 10000, motionSamples: secondarySamples },
    dispatchTimes: [6000],
    lastShotAt: 6000
  });
  const secondaryQuotaBlocked = secondaryFirePolicy({
    nowMs: 10000,
    combatTargetState: { noDamageMs: 10000, motionSamples: secondarySamples },
    dispatchTimes: [6000, 8000],
    lastShotAt: 8000
  });
  const secondaryCloseExempt = secondaryFirePolicy({
    nowMs: 10000,
    target: { distance: 1000 },
    combatTargetState: {
      motionSamples: [
        { at: 9500, newBulletCount: 1 },
        { at: 9900, newBulletCount: 1 }
      ]
    },
    dispatchTimes: [9600, 9700, 9800, 9900],
    lastShotAt: 9900
  });
  const secondaryCloseNotSustained = secondaryClosePressurePolicy({
    nowMs: 10000,
    target: { distance: 1000 },
    combatTargetState: { motionSamples: [{ at: 9900, newBulletCount: 1 }] }
  });
  const secondaryInvulnerableBlocked = secondaryFirePolicy({
    nowMs: 10000,
    target: { invulnerable: true },
    combatTargetState: { motionSamples: secondarySamples },
    dispatchTimes: []
  });
  const retainedSecondaryThreat = secondaryRetentionPolicy({
    combatRole: 'secondary',
    lastFiringAt: 7000,
    lastThreatAt: 6000
  }, 12000, { secondaryTargetRetentionWindowMs: 5000 });
  const retainedAtPressureLease = secondaryRetentionPolicy({
    combatRole: 'secondary',
    hasDamagedSelf: true,
    lastSelfDamageAt: 9500
  }, 12000);
  const expiredSecondaryThreat = secondaryRetentionPolicy({
    combatRole: 'secondary',
    lastFiringAt: 6999,
    lastThreatAt: 6000
  }, 12000);
  const expiredAtPressureLease = secondaryRetentionPolicy({
    combatRole: 'secondary',
    lastFiringAt: 9499
  }, 12000);
  const proximityOnlySecondary = secondaryRetentionPolicy({
    combatRole: 'secondary'
  }, 12000);
  results.push({
    name: 'secondary-fire-cadence-quota-close-pressure-and-invulnerable-gates',
    passed: secondaryCadenceMs(0) === 160
      && secondaryCadenceMs(10000) === 160
      && secondaryAllowed.allowed === true
      && secondaryAllowed.ownShots === 1
      && secondaryAllowed.opponentShots === 2
      && secondaryQuotaBlocked.allowed === false
      && secondaryQuotaBlocked.reason === 'secondary-five-second-shot-quota'
      && secondaryCloseExempt.allowed === true
      && secondaryCloseExempt.throttleExempt === true
      && secondaryCloseExempt.reason === 'secondary-close-pressure-normal-fire'
      && secondaryCloseNotSustained.active === false
      && secondaryCloseNotSustained.sustainedAttack === false
      && secondaryInvulnerableBlocked.reason === 'secondary-invulnerable-dodge-only'
      && retainedSecondaryThreat.retained === true
      && retainedSecondaryThreat.ageMs === 5000
      && retainedSecondaryThreat.windowMs === 5000
      && retainedAtPressureLease.retained === true
      && retainedAtPressureLease.ageMs === 2500
      && retainedAtPressureLease.latestEvidenceType === 'attributable-self-damage'
      && retainedAtPressureLease.windowMs === 2500
      && expiredSecondaryThreat.retained === false
      && expiredAtPressureLease.retained === false
      && proximityOnlySecondary.retained === false
  });

  // 自身伤害进度维持副目标: 只延长不脱战, 边界条件全部收紧。
  const ownDamageSecondaryState = {
    combatRole: 'secondary',
    lastFiringAt: 9000,
    lastThreatAt: 9000,
    damageFromStart: 48,
    lastDamageAmount: 3,
    lastDamageAt: 11800
  };
  const ownDamageContext = {
    selfHp: 94,
    lowHpThreshold: 50,
    attackRange: 14500,
    targetVisible: true,
    targetDistance: 2385
  };
  const ownDamageRetained = secondaryRetentionPolicy(ownDamageSecondaryState, 12000, {}, ownDamageContext);
  const ownDamageRetainedAtLease = secondaryRetentionPolicy(
    { ...ownDamageSecondaryState, lastDamageAt: 9500 },
    12000,
    {},
    ownDamageContext
  );
  // own-damage 分支用它自己的更长租约 (5000ms): 打出过可归因伤害的同一场交战
  // 不该因为对手绕行断火而脱战。2501ms 仍然保留, 5000ms 是边界内最后一帧,
  // 5001ms 过期。没有伤害进度的证据仍然严格走 2500/2501ms 基础租约。
  const ownDamageRetainedPastBaseLease = secondaryRetentionPolicy(
    { ...ownDamageSecondaryState, lastDamageAt: 9499 },
    12000,
    {},
    ownDamageContext
  );
  const ownDamageRetainedAtOwnDamageLease = secondaryRetentionPolicy(
    { ...ownDamageSecondaryState, lastDamageAt: 7000 },
    12000,
    {},
    ownDamageContext
  );
  const ownDamageExpiredAtLease = secondaryRetentionPolicy(
    { ...ownDamageSecondaryState, lastDamageAt: 6999 },
    12000,
    {},
    ownDamageContext
  );
  const ownDamageLowHp = secondaryRetentionPolicy(ownDamageSecondaryState, 12000, {}, {
    ...ownDamageContext,
    selfHp: 50
  });
  const ownDamageOutOfRange = secondaryRetentionPolicy(ownDamageSecondaryState, 12000, {}, {
    ...ownDamageContext,
    targetDistance: 14501
  });
  const ownDamageInvisible = secondaryRetentionPolicy(ownDamageSecondaryState, 12000, {}, {
    ...ownDamageContext,
    targetVisible: false
  });
  const ownDamageWithoutIncomingEvidence = secondaryRetentionPolicy(
    {
      combatRole: 'secondary',
      damageFromStart: 48,
      lastDamageAmount: 3,
      lastDamageAt: 11800
    },
    12000,
    {},
    ownDamageContext
  );
  const ownDamageWithoutProgress = secondaryRetentionPolicy(
    { ...ownDamageSecondaryState, damageFromStart: 0, lastDamageAmount: 0 },
    12000,
    {},
    ownDamageContext
  );
  const ownDamageDisabled = secondaryRetentionPolicy(
    ownDamageSecondaryState,
    12000,
    { secondaryOwnDamageRetentionEnabled: false },
    ownDamageContext
  );
  results.push({
    name: 'secondary-own-damage-progress-retains-engagement-without-chase-authority',
    passed: ownDamageRetained.retained === true
      && ownDamageRetained.latestEvidenceType === 'own-damage-progress'
      && ownDamageRetained.ageMs === 200
      && ownDamageRetained.reason === 'secondary-own-damage-progress-grace'
      && ownDamageRetainedAtLease.retained === true
      && ownDamageRetainedAtLease.ageMs === 2500
      && ownDamageRetainedPastBaseLease.retained === true
      && ownDamageRetainedPastBaseLease.ageMs === 2501
      && ownDamageRetainedPastBaseLease.windowMs === 5000
      && ownDamageRetainedPastBaseLease.baseWindowMs === 2500
      && ownDamageRetainedAtOwnDamageLease.retained === true
      && ownDamageRetainedAtOwnDamageLease.ageMs === 5000
      && ownDamageExpiredAtLease.retained === false
      // 伤害进度过了 5000ms 后不再是有效证据, 回落到基础租约下的开火证据,
      // 而那条也已经过期 (3000ms > 2500ms), 所以整体脱战。
      && ownDamageExpiredAtLease.ageMs === 3000
      && ownDamageExpiredAtLease.latestEvidenceType === 'target-firing'
      && ownDamageExpiredAtLease.windowMs === 2500
      && ownDamageExpiredAtLease.ownDamageProgress.reason === 'own-damage-progress-expired'
      && ownDamageLowHp.retained === false
      && ownDamageLowHp.ownDamageProgress.reason === 'self-hp-at-or-below-leave-threshold'
      && ownDamageOutOfRange.retained === false
      && ownDamageOutOfRange.ownDamageProgress.reason === 'target-outside-attack-range'
      && ownDamageInvisible.retained === false
      && ownDamageInvisible.ownDamageProgress.reason === 'target-not-realtime-visible'
      && ownDamageWithoutIncomingEvidence.retained === false
      && ownDamageWithoutIncomingEvidence.ownDamageProgress.reason === 'no-defensive-entry-evidence'
      && ownDamageWithoutProgress.retained === false
      && ownDamageWithoutProgress.ownDamageProgress.reason === 'no-own-damage-progress'
      && ownDamageDisabled.retained === false
      && ownDamageDisabled.ownDamageProgress.reason === 'own-damage-retention-disabled'
  });

  const unsafePrimaryRace = primaryRewardSurvivalRacePolicy({
    nowMs: 10000,
    selfHp: 67,
    primaryHp: 100,
    primaryDistanceCm: 5000,
    secondarySamples,
    closePressure: { active: true }
  });
  const safePrimaryRace = primaryRewardSurvivalRacePolicy({
    nowMs: 10000,
    selfHp: 100,
    primaryHp: 1,
    primaryDistanceCm: 100,
    secondarySamples,
    closePressure: { active: true }
  });
  const equalEtaRace = primaryRewardSurvivalRacePolicy({
    nowMs: 10000,
    selfHp: 53,
    primaryHp: 1,
    primaryDistanceCm: 100,
    secondarySamples: [
      { at: 9000, newBulletCount: 1, selfHp: 56 },
      { at: 10000, newBulletCount: 1, selfHp: 53 }
    ],
    closePressure: { active: true }
  }, {
    secondaryTargetRacePrimaryOwnDamageRateHpPerSec: 1,
    secondaryTargetRacePickupConfirmMs: 0,
    secondaryTargetRaceSafetyMarginMs: 0
  });
  const primaryArbitration = dualTargetFireArbitration({
    secondaryActive: true,
    primaryAuthorized: true,
    closePressure: { active: false },
    rewardRace: safePrimaryRace
  });
  const defensiveArbitration = dualTargetFireArbitration({
    secondaryActive: true,
    primaryAuthorized: false,
    closePressure: { active: false }
  });
  const focusArbitration = dualTargetFireArbitration({
    secondaryActive: true,
    primaryAuthorized: true,
    closePressure: { active: true },
    rewardRace: unsafePrimaryRace
  });
  results.push({
    name: 'dual-target-primary-reward-survival-race-and-fire-arbitration',
    passed: unsafePrimaryRace.evaluated === true
      && unsafePrimaryRace.shouldFocusSecondary === true
      && safePrimaryRace.continuePrimary === true
      && equalEtaRace.primaryRewardEtaMs === equalEtaRace.selfHp50EtaMs
      && equalEtaRace.shouldFocusSecondary === true
      && primaryArbitration.mode === 'primary-profit'
      && defensiveArbitration.mode === 'secondary-defensive'
      && focusArbitration.mode === 'secondary-focus'
  });

  const outsideClosePressureEvidence = incomingPressureEvidencePolicy({
    nowMs: 10000,
    ownerIds: ['32551'],
    recentAttributableDamageAt: 9800,
    residualThreatAt: 9900,
    established: true
  });
  const dualOwnerFinishRace = primaryRewardSurvivalRacePolicy({
    nowMs: 10000,
    selfHp: 91,
    primaryHp: 1,
    primaryDistanceCm: 392,
    closePressure: { active: false, distanceCm: 2046 },
    pressureEvidence: outsideClosePressureEvidence,
    ownerIds: ['32551', '31361'],
    incomingSamplesByOwner: {
      '32551': [
        { at: 9000, newBulletCount: 1, selfHp: 91, attributableSelfDamage: false },
        { at: 9900, newBulletCount: 1, selfHp: 91, attributableSelfDamage: false }
      ],
      '31361': [
        { at: 9300, newBulletCount: 1, selfHp: 94, selfDamageAmount: 3, attributableSelfDamage: true },
        { at: 9800, newBulletCount: 1, selfHp: 91, selfDamageAmount: 3, attributableSelfDamage: true }
      ]
    }
  });
  const outsideCloseFinishRace = primaryFinishRaceAuthorization({
    nowMs: 10000,
    selfHp: 91,
    primaryHp: 1,
    primaryTarget: { user_id: 7, alive: true, hp: 1 },
    primaryPhysicalEligible: true,
    primaryCompetitionAllowed: true,
    primaryTargetFresh: true,
    primaryNormalAuthorized: false,
    normalFireBlocker: 'fire-state:dodge-reserve',
    closePressure: { active: false },
    pressureEvidence: outsideClosePressureEvidence,
    rewardRace: dualOwnerFinishRace,
    stamina5s: 3000,
    hardReserveMs: 1800,
    shotCostMs: 500
  });
  const expiredOutsideCloseEvidence = incomingPressureEvidencePolicy({
    nowMs: 13000,
    ownerIds: ['32551'],
    residualThreatAt: 9900,
    established: true
  });
  const futureOutsideCloseEvidence = incomingPressureEvidencePolicy({
    nowMs: 10000,
    ownerIds: ['32551'],
    residualThreatAt: 10001,
    established: true
  });
  results.push({
    name: 'finish-race-uses-recent-multi-owner-pressure-outside-close-distance',
    passed: outsideClosePressureEvidence.active === true
      && outsideClosePressureEvidence.ownerKnown === true
      && outsideClosePressureEvidence.evidenceTypes.includes('residual-threat')
      && dualOwnerFinishRace.evaluated === true
      && dualOwnerFinishRace.continuePrimary === true
      && dualOwnerFinishRace.incomingOwnerCount === 2
      && outsideCloseFinishRace.eligible === true
      && outsideCloseFinishRace.closePressure === false
      && outsideCloseFinishRace.pressureEvidenceActive === true
      && expiredOutsideCloseEvidence.active === false
      && futureOutsideCloseEvidence.active === false
  });

  const finishRaceReward = primaryRewardSurvivalRacePolicy({
    nowMs: 10000,
    selfHp: 80,
    primaryHp: 7,
    primaryDistanceCm: 100,
    secondarySamples: [
      { at: 9000, newBulletCount: 1, selfHp: 80 },
      { at: 10000, newBulletCount: 1, selfHp: 79 }
    ],
    primarySamples: [
      { at: 9000, hp: 10 },
      { at: 10000, hp: 7 }
    ],
    closePressure: { active: true }
  });
  const finishRaceSoftReserve = primaryFinishRaceAuthorization({
    nowMs: 10000,
    selfHp: 80,
    primaryHp: 7,
    primaryTarget: { user_id: 7, alive: true, hp: 7 },
    primaryPhysicalEligible: true,
    primaryCompetitionAllowed: true,
    primaryTargetFresh: true,
    primaryNormalAuthorized: false,
    normalFireBlocker: 'fire-state:dodge-reserve',
    closePressure: { active: true },
    rewardRace: finishRaceReward,
    stamina5s: 3000,
    hardReserveMs: 1800,
    shotCostMs: 500,
    dodgeActionCostMs: 0
  });
  const finishRaceAtFifty = primaryFinishRaceAuthorization({
    nowMs: 10000,
    selfHp: 50,
    primaryHp: 7,
    primaryTarget: { user_id: 7, alive: true, hp: 7 },
    primaryPhysicalEligible: true,
    primaryCompetitionAllowed: true,
    primaryTargetFresh: true,
    primaryNormalAuthorized: true,
    closePressure: { active: true },
    rewardRace: finishRaceReward,
    stamina5s: 3000,
    hardReserveMs: 1800,
    shotCostMs: 500
  });
  const finishRaceMissingEvidence = primaryFinishRaceAuthorization({
    nowMs: 10000,
    selfHp: 80,
    primaryHp: 7,
    primaryTarget: { user_id: 7, alive: true, hp: 7 },
    primaryPhysicalEligible: true,
    primaryCompetitionAllowed: true,
    primaryTargetFresh: true,
    primaryNormalAuthorized: true,
    closePressure: { active: true },
    rewardRace: { evaluated: false, continuePrimary: true },
    stamina5s: 3000,
    hardReserveMs: 1800,
    shotCostMs: 500
  });
  const finishRaceHardReserve = primaryFinishRaceAuthorization({
    nowMs: 10000,
    selfHp: 80,
    primaryHp: 7,
    primaryTarget: { user_id: 7, alive: true, hp: 7 },
    primaryPhysicalEligible: true,
    primaryCompetitionAllowed: true,
    primaryTargetFresh: true,
    primaryNormalAuthorized: false,
    normalFireBlocker: 'fire-state:dodge-reserve',
    closePressure: { active: true },
    rewardRace: finishRaceReward,
    stamina5s: 2299,
    hardReserveMs: 1800,
    shotCostMs: 500
  });
  const finishRaceArbitration = dualTargetFireArbitration({
    secondaryActive: true,
    primaryPhysicalEligible: true,
    primaryNormalAuthorized: false,
    primaryFinishAuthorized: finishRaceSoftReserve.eligible,
    closePressure: { active: true },
    rewardRace: finishRaceReward
  });
  results.push({
    name: 'primary-finish-race-requires-realtime-physical-eligibility-and-keeps-hard-hp-stamina-gates',
    passed: finishRaceReward.continuePrimary === true
      && finishRaceSoftReserve.eligible === true
      && finishRaceSoftReserve.reason === 'primary-finish-race-soft-reserve-override'
      && finishRaceArbitration.mode === 'primary-finish-race'
      && finishRaceAtFifty.eligible === false
      && finishRaceAtFifty.hardBlockers.includes('self-hp-at-or-below-50')
      && finishRaceMissingEvidence.eligible === false
      && finishRaceMissingEvidence.hardBlockers.includes('primary-race-rate-evidence-insufficient')
      && finishRaceHardReserve.eligible === false
      && finishRaceHardReserve.hardBlockers.includes('below-hard-reserve')
  });

  const coverHold = evaluateCoverCandidateCore({
    nowMs: 1000,
    self: { user_id: 1, x: 600, y: 0 },
    attacker: { user_id: 2, x: 0, y: 0 },
    primary: { user_id: 7, x: 500, y: 0, hp: 100, alive: true, active: false },
    primaryPassive: true,
    bullets: [{
      incoming: true,
      ownerId: 2,
      startX: 0,
      startY: 0,
      dirX: 1,
      dirY: 0
    }]
  });
  const coverSideMiss = evaluateCoverCandidateCore({
    nowMs: 1000,
    self: { user_id: 1, x: 600, y: 0 },
    attacker: { user_id: 2, x: 0, y: 0 },
    primary: { user_id: 7, x: 500, y: 900, hp: 100, alive: true, active: false },
    primaryPassive: true,
    bullets: [{ incoming: true, ownerId: 2, dirX: 1, dirY: 0 }]
  });
  const coverInvulnerable = evaluateCoverCandidateCore({
    nowMs: 1000,
    self: { user_id: 1, x: 600, y: 0 },
    attacker: { user_id: 2, x: 0, y: 0 },
    primary: {
      user_id: 7,
      x: 500,
      y: 0,
      hp: 100,
      alive: true,
      active: false,
      invulnerableProtectionLeaseUntilMs: 1100
    },
    primaryPassive: true,
    bullets: [{ incoming: true, ownerId: 2, dirX: 1, dirY: 0 }]
  });
  const coverStale = evaluateCoverCandidateCore({
    nowMs: 1000,
    positionAgeMs: 501,
    self: { user_id: 1, x: 600, y: 0 },
    attacker: { user_id: 2, x: 0, y: 0 },
    primary: { user_id: 7, x: 500, y: 0, hp: 100, alive: true, active: false },
    primaryPassive: true,
    bullets: [{ incoming: true, ownerId: 2, dirX: 1, dirY: 0 }]
  });
  results.push({
    name: 'cover-hypothesis-is-realtime-geometric-and-never-claims-server-immunity',
    passed: coverHold.state === 'cover-hold'
      && coverHold.coverHypothesis === 'cover-hypothesis-unverified'
      && coverHold.bulletCorridor === true
      && coverSideMiss.state === 'released'
      && coverSideMiss.releaseReason === 'primary-outside-cover-corridor'
      && coverInvulnerable.releaseReason === 'primary-invulnerable'
      && coverStale.releaseReason === 'realtime-position-stale'
  });

  const dodgeGeneration = resolveDodgeOwnershipCore({
    nowMs: 1000,
    currentThreat: true,
    threatGeneration: 'bullet:1',
    direction: { dx: 1, dy: 0 }
  });
  const heldDodgeGeneration = resolveDodgeOwnershipCore({
    nowMs: 1200,
    currentThreat: false,
    previous: dodgeGeneration
  });
  const releasedDodgeGeneration = resolveDodgeOwnershipCore({
    nowMs: 1600,
    currentThreat: false,
    previous: heldDodgeGeneration
  });
  const dodgeOwner = selectCombatMovementOwnerCore({
    requestedOwner: 'secondary-follow-primary-target',
    dodgeOwnership: heldDodgeGeneration,
    coverActive: true,
    finishRaceActive: true
  });
  results.push({
    name: 'emergency-dodge-ownership-outlives-one-frame-and-preempts-cover-finish-escort',
    passed: dodgeGeneration.owner === 'emergency-dodge'
      && heldDodgeGeneration.active === true
      && heldDodgeGeneration.threatGeneration === 'bullet:1'
      && releasedDodgeGeneration.active === false
      && dodgeOwner.owner === 'emergency-dodge'
  });

  const killRaceBlocked = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 150, y: 0, active: true }]
  });
  const killRaceEqualBlocked = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 400, y: 0, active: true }]
  });
  const killRaceSelfCloser = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 500, y: 0, active: true }]
  });
  const killRacePickupRadiusAllowed = profitKillRacePolicy({
    self: { user_id: 1, x: 50, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 190, y: 0, active: true }]
  });
  const killRaceFarCompetitorIgnored = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 8201, y: 0, active: true }]
  });
  const passiveKillRaceBlocked = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 100, current_join_mode: 'Passive', active: false },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 150, y: 0, active: true }]
  });
  const activeHpBoundaryInactive = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 20, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 150, y: 0, active: true }]
  });
  const killRaceJoinModeActiveBlocked = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{
      user_id: 3,
      x: 150,
      y: 0,
      active: false,
      current_join_mode: 'Active'
    }]
  });
  const snapshotCompetitorIgnored = profitKillRacePolicy({
    self: { user_id: 1, x: 0, y: 0 },
    target: { user_id: 2, x: 200, y: 0, hp: 19, current_join_mode: 'Active' },
    primaryTarget: true,
    realtimeTargets: [{ user_id: 3, x: 150, y: 0, active: true, authority: 'snapshot' }]
  });
  results.push({
    name: 'primary-profit-target-competition-is-nearby-bounded-and-pickup-aware',
    passed: killRaceBlocked.active === true
      && killRaceBlocked.approaching === true
      && killRaceBlocked.direction.dx === 1
      && killRaceBlocked.fireAllowed === false
      && killRaceBlocked.pickupRadiusCm === 150
      && killRaceBlocked.competitorRadiusCm === 8000
      && killRaceEqualBlocked.fireAllowed === false
      && killRaceSelfCloser.fireAllowed === true
      && killRacePickupRadiusAllowed.fireAllowed === true
      && killRacePickupRadiusAllowed.insidePickupRadius === true
      && killRacePickupRadiusAllowed.approaching === false
      && killRaceFarCompetitorIgnored.active === false
      && killRaceFarCompetitorIgnored.reason === 'no-nearby-active-competitor'
      && passiveKillRaceBlocked.active === true
      && passiveKillRaceBlocked.targetActivity === 'passive'
      && passiveKillRaceBlocked.fireAllowed === false
      && activeHpBoundaryInactive.active === false
      && killRaceJoinModeActiveBlocked.fireAllowed === false
      && snapshotCompetitorIgnored.active === false
      && snapshotCompetitorIgnored.reason === 'no-nearby-active-competitor'
  });

  const competitionEvidenceState = {};
  const competitionSelf = { user_id: 1, x: 0, y: 0 };
  const competitionTarget = {
    user_id: 2,
    x: 500,
    y: 0,
    hp: 19,
    current_join_mode: 'Active'
  };
  const quietBulletOwner = {
    user_id: 3,
    x: 450,
    y: 0,
    active: false,
    authority: 'realtime'
  };
  const bulletEvidence = observeProfitCompetitorEvidence(competitionEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [competitionTarget, quietBulletOwner],
    realtimeBullets: [{ owner_user_id: 3, authority: 'realtime' }],
    observedTick: 100,
    nowMs: 1000
  });
  const bulletEvidenceGate = profitKillRacePolicy({
    self: competitionSelf,
    target: competitionTarget,
    primaryTarget: true,
    competitionTargets: bulletEvidence.competitionTargets,
    observedTick: 100
  });
  const heldEvidence = observeProfitCompetitorEvidence(competitionEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [competitionTarget, quietBulletOwner],
    realtimeBullets: [],
    observedTick: 101,
    nowMs: 1100
  });
  const missingEvidence = observeProfitCompetitorEvidence(competitionEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [competitionTarget],
    realtimeBullets: [],
    observedTick: 102,
    nowMs: 1200
  });
  const missingEvidenceGate = profitKillRacePolicy({
    self: competitionSelf,
    target: competitionTarget,
    primaryTarget: true,
    competitionTargets: missingEvidence.competitionTargets,
    observedTick: 102
  });
  const missingEvidencePickupGate = profitKillRacePolicy({
    self: { ...competitionSelf, x: 350 },
    target: competitionTarget,
    primaryTarget: true,
    competitionTargets: missingEvidence.competitionTargets,
    observedTick: 102
  });
  const sameTickBefore = {
    lastStrongAt: competitionEvidenceState.records['3']?.lastStrongAt,
    clearConfirmations: competitionEvidenceState.records['3']?.clearConfirmations
  };
  observeProfitCompetitorEvidence(competitionEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [competitionTarget, { ...quietBulletOwner, current_join_mode: 'Passive' }],
    realtimeBullets: [],
    observedTick: 102,
    nowMs: 1300
  });
  const sameTickAfter = {
    lastStrongAt: competitionEvidenceState.records['3']?.lastStrongAt,
    clearConfirmations: competitionEvidenceState.records['3']?.clearConfirmations
  };
  results.push({
    name: 'primary-profit-competition-retains-realtime-bullet-owner-evidence-across-uncertain-frames',
    passed: bulletEvidenceGate.fireAllowed === false
      && bulletEvidenceGate.nearestCompetitor?.evidenceReasons?.includes('realtime-bullet-owner')
      && heldEvidence.competitionTargets.find(item => String(item.user_id) === '3')
        ?.profitCompetitionPositionFresh === true
      && heldEvidence.competitionTargets.find(item => String(item.user_id) === '3')
        ?.profitCompetitionHeld === true
      && missingEvidence.competitionTargets.find(item => String(item.user_id) === '3')
        ?.profitCompetitionPositionFresh === false
      && missingEvidenceGate.fireAllowed === false
      && missingEvidenceGate.reason === 'active-competitor-position-retained'
      && missingEvidencePickupGate.fireAllowed === true
      && missingEvidencePickupGate.insidePickupRadius === true
      && sameTickAfter.lastStrongAt === sameTickBefore.lastStrongAt
      && sameTickAfter.clearConfirmations === sameTickBefore.clearConfirmations
  });

  const missingOwnerEvidence = observeProfitCompetitorEvidence({}, {
    self: competitionSelf,
    realtimeTargets: [competitionTarget],
    realtimeBullets: [{ owner_user_id: 4, authority: 'realtime' }],
    observedTick: 110,
    nowMs: 2000
  });
  const missingOwnerGate = profitKillRacePolicy({
    self: competitionSelf,
    target: competitionTarget,
    primaryTarget: true,
    competitionTargets: missingOwnerEvidence.competitionTargets,
    observedTick: 110
  });
  const missingOwnerPickupGate = profitKillRacePolicy({
    self: { ...competitionSelf, x: 400 },
    target: { ...competitionTarget, x: 500 },
    primaryTarget: true,
    competitionTargets: missingOwnerEvidence.competitionTargets,
    observedTick: 110
  });
  results.push({
    name: 'primary-profit-competition-bullet-owner-without-position-fails-closed-outside-pickup-radius',
    passed: missingOwnerGate.active === true
      && missingOwnerGate.competitorCount === 1
      && missingOwnerGate.nearestCompetitor?.id === '4'
      && missingOwnerGate.nearestCompetitor?.positionFresh === false
      && !Number.isFinite(missingOwnerGate.nearestCompetitor?.distanceCm)
      && missingOwnerGate.competitorPositionUncertain === true
      && missingOwnerGate.fireAllowed === false
      && missingOwnerGate.reason === 'active-competitor-position-retained'
      && missingOwnerPickupGate.fireAllowed === true
      && missingOwnerPickupGate.insidePickupRadius === true
  });

  const passiveEvidenceState = {};
  observeProfitCompetitorEvidence(passiveEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [quietBulletOwner],
    realtimeBullets: [{ owner_user_id: 3 }],
    observedTick: 200,
    nowMs: 2000
  });
  const passiveFrames = [201, 202, 203].map((tick, index) => observeProfitCompetitorEvidence(
    passiveEvidenceState,
    {
      self: competitionSelf,
      realtimeTargets: [{ ...quietBulletOwner, current_join_mode: 'Passive' }],
      realtimeBullets: [],
      observedTick: tick,
      nowMs: 2100 + index * 100
    }
  ));
  const ttlEvidenceState = {};
  observeProfitCompetitorEvidence(ttlEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [quietBulletOwner],
    realtimeBullets: [{ owner_user_id: 3 }],
    observedTick: 300,
    nowMs: 3000
  }, { profitKillRaceEvidenceHoldTtlMs: 1000 });
  const ttlExpired = observeProfitCompetitorEvidence(ttlEvidenceState, {
    self: competitionSelf,
    realtimeTargets: [],
    realtimeBullets: [],
    observedTick: 301,
    nowMs: 4001
  }, { profitKillRaceEvidenceHoldTtlMs: 1000 });
  results.push({
    name: 'primary-profit-competition-needs-three-fresh-passive-frames-or-ttl-expiry-to-clear',
    passed: passiveFrames[0].competitionTargets.some(item => String(item.user_id) === '3')
      && passiveFrames[1].competitionTargets.some(item => String(item.user_id) === '3')
      && !passiveFrames[2].competitionTargets.some(item => String(item.user_id) === '3')
      && ttlExpired.competitionTargets.length === 0
  });

  const healthySecondaryExitPolicy = secondaryCombatExitPolicy(
    { combatRole: 'secondary', secondaryTarget: true },
    80
  );
  const lowHpSecondaryExitPolicy = secondaryCombatExitPolicy(
    { combatRole: 'secondary', secondaryTarget: true },
    50
  );
  const retainedSecondaryExitPolicy = secondaryCombatExitPolicy(null, 80, {
    retainedTarget: { id: 32551, combatRole: 'secondary', secondaryTarget: true },
    combatPhaseTargetId: '32551'
  });
  const mismatchedRetainedSecondaryExitPolicy = secondaryCombatExitPolicy(null, 80, {
    retainedTarget: { id: 32551, combatRole: 'secondary', secondaryTarget: true },
    combatPhaseTargetId: '895'
  });
  const lowHpRetainedSecondaryExitPolicy = secondaryCombatExitPolicy(null, 50, {
    retainedTarget: { id: 32551, combatRole: 'secondary', secondaryTarget: true },
    combatPhaseTargetId: '32551'
  });
  results.push({
    name: 'secondary-exit-suppression-uses-matching-retained-role-and-stops-at-hp-fifty',
    passed: healthySecondaryExitPolicy.suppressClearHpGap === true
      && healthySecondaryExitPolicy.suppressMissCloseTimeout === true
      && healthySecondaryExitPolicy.suppressExchangeStopLoss === true
      && lowHpSecondaryExitPolicy.preserveLowHpExits === true
      && lowHpSecondaryExitPolicy.lowHpUnconditionalExit === true
      && lowHpSecondaryExitPolicy.suppressClearHpGap === false
      && retainedSecondaryExitPolicy.targetSource === 'retained-phase-match'
      && retainedSecondaryExitPolicy.suppressMissCloseTimeout === true
      && mismatchedRetainedSecondaryExitPolicy.targetSource === 'none'
      && mismatchedRetainedSecondaryExitPolicy.suppressMissCloseTimeout === false
      && lowHpRetainedSecondaryExitPolicy.preserveLowHpExits === true
      && lowHpRetainedSecondaryExitPolicy.lowHpUnconditionalExit === true
      && lowHpRetainedSecondaryExitPolicy.suppressMissCloseTimeout === false
  });

  // The realtime leave-risk path composes this policy with the static HP exit,
  // mirroring the combat-adapter exit paths. Reproduced with the 2026-09-01
  // 00:06 values: self 52 against an averaged 76 (97 and 55) is a 24-point gap
  // that tripped `clear-hp-gap` while escorting a healthy defensive secondary.
  // Suppression must cover only that rule, and must stop at HP 50 inclusive
  // where the unconditional secondary leave takes over.
  const escortedSecondary = { combatRole: 'secondary', secondaryTarget: true };
  const composedStaticHpExit = (selfHp, targetHp, target = escortedSecondary) => {
    const policy = secondaryCombatExitPolicy(target, selfHp);
    const raw = evaluateCombatHpExitCore({ selfHp, targetHp }, {});
    const suppressed = Boolean(raw && raw.rule === 'clear-hp-gap' && policy.suppressClearHpGap);
    return { rule: raw?.rule ?? null, suppressed, effective: suppressed ? null : raw };
  };
  const escortedGapSuppressed = composedStaticHpExit(52, 76);
  const escortedGapAtHpFifty = composedStaticHpExit(50, 76);
  const escortedCriticalStillExits = composedStaticHpExit(30, 76);
  const escortedLowHpBehindStillExits = composedStaticHpExit(49, 55);
  const soloPrimaryGapStillExits = composedStaticHpExit(52, 76, { combatRole: 'primary' });
  results.push({
    name: 'realtime-leave-risk-clear-hp-gap-suppression-matches-combat-path-and-stops-at-hp-fifty',
    passed: escortedGapSuppressed.rule === 'clear-hp-gap'
      && escortedGapSuppressed.suppressed === true
      && escortedGapSuppressed.effective === null
      && escortedGapAtHpFifty.suppressed === false
      && escortedGapAtHpFifty.effective?.shouldLeave === true
      && escortedCriticalStillExits.rule === 'critical-hp'
      && escortedCriticalStillExits.suppressed === false
      && escortedCriticalStillExits.effective?.reason === 'combat-critical-hp-leave'
      && escortedLowHpBehindStillExits.rule === 'low-hp-behind'
      && escortedLowHpBehindStillExits.suppressed === false
      && escortedLowHpBehindStillExits.effective?.reason === 'combat-low-hp-disadvantage-leave'
      && soloPrimaryGapStillExits.rule === 'clear-hp-gap'
      && soloPrimaryGapStillExits.suppressed === false
      && soloPrimaryGapStillExits.effective?.reason === 'combat-hp-disadvantage-leave'
  });

  const secondaryAdmissionTargetBase = {
    alive: true,
    authority: 'realtime',
    user_id: 8,
    hp: 100,
    distance: 14500,
    active: false,
    current_join_mode: 'Passive',
    firing: false,
    drop: 0
  };
  const highHpNonPrimaryAdmission = combatTargetAdmissionCore({
    ...secondaryAdmissionTargetBase,
    active: true,
    current_join_mode: 'Active',
    drop: 90
  }, {
    selfHp: 100,
    profitMissionTargetId: '42',
    combatAttackRange: 14500,
    selfStamina5s: 10000,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 200000
  });
  const proactivePrimaryAdmission = combatTargetAdmissionCore({
    ...secondaryAdmissionTargetBase,
    active: true,
    current_join_mode: 'Active',
    drop: 90
  }, {
    selfHp: 100,
    selectedProfitCombatTargetId: '8',
    profitSelectionKnown: true,
    combatAttackRange: 14500,
    selfStamina5s: 10000,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 200000
  });
  const mediumInsideAdmission = combatTargetAdmissionCore(secondaryAdmissionTargetBase, {
    selfHp: 70,
    profitMissionTargetId: '42',
    combatAttackRange: 14500,
    selfStamina5s: 1,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 1
  });
  const mediumActiveInsideAdmission = combatTargetAdmissionCore({
    ...secondaryAdmissionTargetBase,
    active: true,
    current_join_mode: 'Active'
  }, {
    selfHp: 70,
    profitMissionTargetId: '42',
    combatAttackRange: 14500,
    selfStamina5s: 1,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 1
  });
  const mediumOutsideAdmission = combatTargetAdmissionCore({
    ...secondaryAdmissionTargetBase,
    distance: 14501
  }, {
    selfHp: 70,
    profitMissionTargetId: '42',
    combatAttackRange: 14500
  });
  const lowHpSecondaryAdmission = combatTargetAdmissionCore(secondaryAdmissionTargetBase, {
    selfHp: 50,
    profitMissionTargetId: '42',
    combatAttackRange: 14500
  });
  const lowHpActiveSecondaryAdmission = combatTargetAdmissionCore({
    ...secondaryAdmissionTargetBase,
    active: true,
    current_join_mode: 'Active'
  }, {
    selfHp: 50,
    profitMissionTargetId: '42',
    combatAttackRange: 14500
  });
  const lowHpFiringSecondaryAdmission = combatTargetAdmissionCore({
    ...secondaryAdmissionTargetBase,
    firing: true
  }, {
    selfHp: 50,
    profitMissionTargetId: '42',
    combatAttackRange: 14500
  });
  results.push({
    name: 'combat-admission-requires-active-distance-secondary-or-attack-evidence',
    passed: highHpNonPrimaryAdmission.eligible === false
      && highHpNonPrimaryAdmission.profitEligible === false
      && proactivePrimaryAdmission.eligible === true
      && proactivePrimaryAdmission.profitEligible === true
      && proactivePrimaryAdmission.secondaryEligible === false
      && mediumInsideAdmission.eligible === false
      && mediumInsideAdmission.secondaryEligible === false
      && mediumInsideAdmission.proximityEvidence === false
      && mediumActiveInsideAdmission.eligible === true
      && mediumActiveInsideAdmission.secondaryEligible === true
      && mediumActiveInsideAdmission.proximityEvidence === true
      && mediumActiveInsideAdmission.attackEvidence === false
      && mediumOutsideAdmission.eligible === false
      && lowHpSecondaryAdmission.lowHpSecondaryExit === false
      && lowHpSecondaryAdmission.secondaryEligible === false
      && lowHpActiveSecondaryAdmission.lowHpSecondaryExit === true
      && lowHpActiveSecondaryAdmission.secondaryEligible === true
      && lowHpFiringSecondaryAdmission.lowHpSecondaryExit === true
      && lowHpFiringSecondaryAdmission.secondaryEligible === true
      && lowHpFiringSecondaryAdmission.attackEvidence === true
  });

  const playerProfitScoreBoundaries = [
    [49, 1],
    [50, 1],
    [51, 1],
    [52, 1.01],
    [449, 2.99],
    [450, 3],
    [451, 3]
  ];
  results.push({
    name: 'player-profit-score-drop-quality-boundaries',
    passed: playerProfitScoreBoundaries.every(([drop, expected]) => (
      playerProfitScoreMultiplierCore(drop) === expected
    )),
    values: Object.fromEntries(playerProfitScoreBoundaries.map(([drop]) => [
      drop,
      playerProfitScoreMultiplierCore(drop)
    ]))
  });

  const remoteProfitTargets = runRemoteProfitTargetsSelfTest();
  results.push({
    name: 'remote-profit-target-boundaries',
    passed: remoteProfitTargets.ok === true,
    cases: remoteProfitTargets.cases
  });

  const loginPointReloginShortcut = runLoginPointReloginShortcutSelfTest();
  results.push({
    name: 'login-point-relogin-shortcut-boundaries',
    passed: loginPointReloginShortcut.ok === true,
    cases: loginPointReloginShortcut.cases
  });

  const hpAttributionSelfTest = runCombatHpLossAttributionSelfTest();
  results.push({
    name: 'combat-hp-loss-attribution-bounded-realtime-evidence',
    passed: hpAttributionSelfTest.ok === true,
    cases: hpAttributionSelfTest.cases,
    error: hpAttributionSelfTest.error || ''
  });

  const dynamicSelf = (hp, maxHp = 100, stamina5s = 10000) => ({
    hp,
    max_hp: maxHp,
    stamina_5s_remaining_milli: stamina5s
  });
  const dynamicTarget = (distance, extra = {}) => ({
    user_id: 8,
    hp: 100,
    alive: true,
    authority: 'realtime',
    distance,
    ...extra
  });
  const dynamicContext = {
    dynamicWhitelistMember: true,
    dynamicWhitelistEnabled: true
  };
  const dynamicPolicy = (hp, distance, context = {}, targetExtra = {}, selfExtra = {}) => (
    evaluateDynamicWhitelistContactCore(
      { ...dynamicSelf(hp), ...selfExtra },
      dynamicTarget(distance, targetExtra),
      { ...dynamicContext, ...context },
      { combatAttackRange: 14500 }
    )
  );
  const fullHpInside = dynamicPolicy(100, 6500);
  const fullHpOutside = dynamicPolicy(100, 6501);
  const eightyOneInside = dynamicPolicy(81, 1);
  const eightyInside = dynamicPolicy(80, 9700);
  const eightyOutside = dynamicPolicy(80, 9701);
  const seventyFiveInside = dynamicPolicy(75, 10500);
  const seventyFiveOutside = dynamicPolicy(75, 10501);
  const fiftyOneRange = dynamicWhitelistCombatRangeCore(dynamicSelf(51), { combatAttackRange: 14500 });
  const fiftyOneInside = dynamicPolicy(51, 14340);
  const fiftyOneOutside = dynamicPolicy(51, 14341);
  results.push({
    name: 'dynamic-whitelist-healthy-pass-through-and-hp-scaled-proximity-boundaries',
    passed: fullHpInside.proactiveCombatEligible === false
      && fullHpOutside.proactiveCombatEligible === false
      && fullHpInside.reason === 'dynamic-whitelist-healthy-pass-through'
      && eightyOneInside.proactiveCombatEligible === false
      && eightyOneInside.proactiveCombatHpEligible === false
      && eightyInside.proactiveCombatEligible === true
      && eightyInside.proactiveCombatHpEligible === true
      && eightyOutside.proactiveCombatEligible === false
      && seventyFiveInside.proactiveCombatEligible === true
      && seventyFiveOutside.proactiveCombatEligible === false
      && fiftyOneRange.rangeCm === 14340
      && fiftyOneInside.proactiveCombatEligible === true
      && fiftyOneOutside.proactiveCombatEligible === false
      && fiftyOneRange.rangeCm <= 14500
  });

  const fiftyLowHp = dynamicPolicy(50, 15000, { recovering: true, recoveryRadiusCm: 15000 });
  const fortyLowHp = dynamicPolicy(40, 20000, { recovering: true, recoveryRadiusCm: 20000 });
  const rollbackLowHp = evaluateDynamicWhitelistContactCore(
    dynamicSelf(40),
    dynamicTarget(20000),
    { ...dynamicContext, recovering: true, recoveryRadiusCm: 20000 },
    { combatAttackRange: 14500, dynamicWhitelistProximitySafetyEnabled: false }
  );
  results.push({
    name: 'dynamic-whitelist-low-hp-contact-exits-survive-proximity-rollback',
    passed: fiftyLowHp.proactiveCombatEligible === false
      && fiftyLowHp.lowHpSafetyExit === true
      && fortyLowHp.proactiveCombatEligible === false
      && fortyLowHp.lowHpSafetyExit === true
      && rollbackLowHp.lowHpSafetyExit === true
  });

  const damagedInside = dynamicPolicy(80, 14500, { damagedSelfToday: true });
  const damagedOutside = dynamicPolicy(80, 14501, { damagedSelfToday: true });
  const healthyDamagedInside = dynamicPolicy(81, 1, { damagedSelfToday: true });
  const healthyDisabledInside = dynamicPolicy(100, 1, { dynamicWhitelistEnabled: false });
  const disabledWithoutMaxHp = evaluateDynamicWhitelistContactCore(
    { hp: 80, stamina_5s_remaining_milli: 10000 },
    dynamicTarget(14500),
    { dynamicWhitelistMember: true, dynamicWhitelistEnabled: false },
    { combatAttackRange: 14500 }
  );
  const proportionalRange = dynamicWhitelistCombatRangeCore(dynamicSelf(150, 200), { combatAttackRange: 14500 });
  results.push({
    name: 'dynamic-whitelist-daily-damage-and-normalized-max-hp-ranges',
    passed: damagedInside.proactiveCombatEligible === true
      && damagedInside.ordinaryRangeOverride === true
      && damagedOutside.proactiveCombatEligible === false
      && healthyDamagedInside.proactiveCombatEligible === false
      && healthyDamagedInside.reason === 'dynamic-whitelist-healthy-pass-through'
      && healthyDisabledInside.proactiveCombatEligible === false
      && disabledWithoutMaxHp.proactiveCombatEligible === true
      && proportionalRange.rangeCm === 10500
  });

  const creatorPolicy = dynamicPolicy(100, 1000, { creatorProtected: true });
  const missingHpPolicy = evaluateDynamicWhitelistContactCore(
    { max_hp: 100, stamina_5s_remaining_milli: 10000 },
    dynamicTarget(1000),
    dynamicContext,
    { combatAttackRange: 14500 }
  );
  const deadPolicy = dynamicPolicy(100, 1000, {}, { alive: false, hp: 0 });
  const invulnerablePolicy = dynamicPolicy(100, 1000, {}, { invulnerable: true });
  const snapshotPolicy = dynamicPolicy(100, 1000, {}, { authority: 'snapshot' });
  const legacyPolicy = evaluateDynamicWhitelistContactCore(
    dynamicSelf(100),
    dynamicTarget(1000, { whitelisted: true }),
    { legacyWhitelistProtected: true },
    { combatAttackRange: 14500 }
  );
  results.push({
    name: 'dynamic-whitelist-hard-protection-and-authority-invalid-targets',
    passed: creatorPolicy.proactiveCombatEligible === false
      && creatorPolicy.lowHpSafetyExit === false
      && legacyPolicy.proactiveCombatEligible === false
      && legacyPolicy.reason === 'legacy-whitelist-hard-protection'
      && missingHpPolicy.proactiveCombatEligible === false
      && deadPolicy.proactiveCombatEligible === false
      && invulnerablePolicy.proactiveCombatEligible === false
      && snapshotPolicy.proactiveCombatEligible === false
  });

  const lowStaminaContact = dynamicPolicy(80, 9000, {}, {}, { stamina_5s_remaining_milli: 2399 });
  const lowStaminaRollback = evaluateDynamicWhitelistContactCore(
    dynamicSelf(80, 100, 2399),
    dynamicTarget(9000),
    dynamicContext,
    { combatAttackRange: 14500, dynamicWhitelistProximitySafetyEnabled: false }
  );
  const collisionOverride = dynamicWhitelistIncomingOverrideCore(
    dynamicTarget(5000),
    { ownerId: 8, incoming: true, cpa: 50, timeToImpact: 500, remainingTicks: 30 },
    dynamicContext,
    { combatAttackRange: 14500, combatBulletHitRadiusCm: 90 }
  );
  const offLaneOverride = dynamicWhitelistIncomingOverrideCore(
    dynamicTarget(5000),
    { ownerId: 8, incoming: true, cpa: 500 },
    dynamicContext,
    { combatAttackRange: 14500, combatBulletHitRadiusCm: 90 }
  );
  results.push({
    name: 'dynamic-whitelist-low-stamina-contact-and-incoming-collision-gates',
    passed: lowStaminaContact.proactiveCombatEligible === true
      && lowStaminaContact.reason === 'dynamic-whitelist-distance-guard'
      && lowStaminaRollback.proactiveCombatEligible === false
      && collisionOverride.incomingDodgeRequired === true
      && collisionOverride.defensiveTargetEligible === true
      && offLaneOverride.incomingDodgeRequired === false
  });

  const reachableIncomingBullet = {
    incoming: true,
    authority: 'realtime',
    cpa: 50,
    distance: 5000,
    timeToImpact: 500,
    remainingTicks: 10
  };
  const beyondLifetimeIncomingBullet = {
    ...reachableIncomingBullet,
    distance: 43900,
    timeToImpact: 4390,
    remainingTicks: 30
  };
  const expiredIncomingBullet = {
    ...reachableIncomingBullet,
    remainingTicks: 0
  };
  results.push({
    name: 'incoming-collision-requires-future-impact-within-bullet-lifetime',
    passed: incomingBulletHasCollisionRiskCore(reachableIncomingBullet)
      && !incomingBulletHasCollisionRiskCore(beyondLifetimeIncomingBullet)
      && !incomingBulletHasCollisionRiskCore(expiredIncomingBullet)
      && !incomingBulletHasCollisionRiskCore({ cpa: 50, timeToImpact: 500 })
  });

  const edgeAction = {
    kind: 'attack',
    band: 'profit',
    target: {
      userId: 33,
      centerActivityEdge: { admitted: true, reason: 'center-afk-edge-admitted' }
    }
  };
  const edgeArbitration = {
    lastAction: edgeAction,
    lastFocus: { band: 'profit', type: 'enemy', id: '33' },
    lastSelectedAt: 1000
  };
  const continuation = deriveCenterActivityAfkContinuationCore(edgeArbitration, {
    nowMs: 3999,
    decisionIntervalMs: 1000
  });
  results.push({
    name: 'center-edge-afk-continuation-is-target-scoped-and-freshness-bounded',
    passed: centerActivityAfkContinuationFreshnessMsCore({ decisionIntervalMs: 1000 }) === 3000
      && centerActivityAfkContinuationFreshnessMsCore({ decisionIntervalMs: 2000 }) === 5000
      && continuation?.targetId === '33'
      && continuation?.ageMs === 2999
      && deriveCenterActivityAfkContinuationCore(edgeArbitration, { nowMs: 4001, decisionIntervalMs: 1000 }) === null
      && deriveCenterActivityAfkContinuationCore({
        ...edgeArbitration,
        lastAction: { ...edgeAction, kind: 'coin' }
      }, { nowMs: 2000 }) === null
      && deriveCenterActivityAfkContinuationCore({
        ...edgeArbitration,
        lastFocus: { band: 'profit', type: 'enemy', id: '34' }
      }, { nowMs: 2000 }) === null
      && deriveCenterActivityAfkContinuationCore({
        ...edgeArbitration,
        lastPreemption: { at: 1000, band: 'safety' }
      }, { nowMs: 2000 }) === null
  });

  const admissionBase = {
    centerRadiusCm: 100000,
    edgeRadiusCm: 114500,
    targetRadiusCm: 104737,
    targetDistanceCm: 4305,
    visibleDistanceCm: 50000,
    authority: 'realtime',
    targetId: 33,
    continuation
  };
  const insideAdmission = evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 99482 });
  const continuedAdmission = evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 100970 });
  results.push({
    name: 'center-edge-afk-admission-preserves-acquisition-boundary-and-hard-release-gates',
    passed: insideAdmission.admitted === true
      && insideAdmission.reason === 'center-afk-edge-admitted'
      && continuedAdmission.admitted === true
      && continuedAdmission.continued === true
      && continuedAdmission.reason === 'center-afk-edge-continuation'
      && evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 100970, targetId: 34 }).reason === 'self-outside-center'
      && evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 114501 }).reason === 'self-outside-afk-edge-radius'
      && evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 100970, targetRadiusCm: 114501 }).reason === 'outside-afk-edge-radius'
      && evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 100970, authority: 'snapshot' }).reason === 'non-realtime-authority'
      && evaluateCenterActivityAfkAdmissionCore({ ...admissionBase, selfRadiusCm: 100970, targetDistanceCm: 50001 }).reason === 'outside-opportunity-visible-distance'
  });

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

  const pickupCompetition = activeCoinPickupCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'near', amount: 16, x: 4800, y: 0, distance: 4800 },
    [{ user_id: 6, name: 'pickup-rival', x: 4750, y: 0, joinModeActive: true, alive: true }]
  );
  const pickupCompetitionByMotion = activeCoinPickupCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'near', amount: 16, x: 4800, y: 0, distance: 4800 },
    [{ user_id: 7, name: 'moving-rival', x: 4750, y: 0, moving: true, alive: true }]
  );
  const pickupCompetitionSelfArrived = activeCoinPickupCompetitionCore(
    { user_id: 1, x: 4650, y: 0 },
    { drop_id: 'near', amount: 16, x: 4800, y: 0, distance: 150 },
    [{ user_id: 6, name: 'pickup-rival', x: 4750, y: 0, active: true, alive: true }]
  );
  const pickupCompetitionPassive = activeCoinPickupCompetitionCore(
    { user_id: 1, x: 0, y: 0 },
    { drop_id: 'near', amount: 16, x: 4800, y: 0, distance: 4800 },
    [{ user_id: 8, name: 'passive-player', x: 4750, y: 0, active: false, alive: true }]
  );
  results.push({
    name: 'active-player-already-in-pickup-radius-blocks-uncommitted-coin',
    passed: pickupCompetition?.reason === 'active-player-in-coin-pickup-area'
      && pickupCompetition.competitorDistanceCm === 50
      && pickupCompetitionByMotion?.competitorId === '7'
      && pickupCompetitionSelfArrived === null
      && pickupCompetitionPassive === null
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
  const relaxedThreshold = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T14:30:00.000Z'), remaining1dMilli: 20000000 }, {});
  const equalBoundary = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T14:00:00.000Z'), remaining1dMilli: 5999166 }, {});
  const overBoundary = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T14:00:00.000Z'), remaining1dMilli: 5999167 }, {});
  const elevenPmBoundary = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T15:59:59.500Z'), remaining1dMilli: 1 }, {});
  const lastHourLeftover = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T15:30:00.000Z'), remaining1dMilli: 20000000 }, {});
  const lastHourExhausted = buildDynamicProfitThresholdCore({ nowMs: Date.parse('2026-07-12T15:30:00.000Z'), remaining1dMilli: 0 }, {});
  results.push({
    name: 'profit-threshold-utc8-reset-reserve-and-burn-window',
    passed: nextDailyProfitResetAtCore(utc8EightAm) === Date.parse('2026-07-12T16:00:00.000Z')
      && activeThreshold.active === true
      && activeThreshold.reserveMs === 1000
      && activeThreshold.reserveStaminaMilli === 0
      && activeThreshold.burnTargetMilli === 20000000
      && activeThreshold.inResetReserveWindow === false
      && Math.round(activeThreshold.burnCapacityMilli) === 47999167
      && relaxedThreshold.active === false
      && relaxedThreshold.reason === 'insufficient-burn-window'
      && relaxedThreshold.burnTargetMilli === 20000000
      && equalBoundary.active === true
      && equalBoundary.reason === 'active'
      && Math.round(equalBoundary.burnCapacityMilli) === 5999167
      && equalBoundary.burnTargetMilli === 5999166
      && overBoundary.active === false
      && overBoundary.reason === 'insufficient-burn-window'
      && Math.round(elevenPmBoundary.burnCapacityMilli) === 0
  });
  results.push({
    name: 'profit-threshold-final-reserve-window-keeps-selecting-by-threshold',
    passed: elevenPmBoundary.active === true
      && elevenPmBoundary.reason === 'reset-reserve-window'
      && elevenPmBoundary.inResetReserveWindow === true
      && lastHourLeftover.active === false
      && lastHourLeftover.reason === 'insufficient-burn-window'
      && Math.round(lastHourLeftover.burnCapacityMilli) === 1499167
      && lastHourExhausted.active === false
      && lastHourExhausted.reason === 'daily-stamina-exhausted'
      && buildDynamicProfitThresholdCore(
        { nowMs: Date.parse('2026-07-12T15:30:00.000Z'), remaining1dMilli: 20000000 },
        { enabled: false }
      ).reason === 'feature-disabled'
      && buildDynamicProfitThresholdCore(
        { nowMs: Date.parse('2026-07-12T14:59:59.999Z'), remaining1dMilli: 20000000 },
        {}
      ).reason === 'insufficient-burn-window'
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
  const parallelIntercept = quadraticInterceptCore(
    { x: 0, y: 0, vx: 35, vy: -35 },
    { x: 8000, y: 4000, vx: 35, vy: -35 },
    { bulletSpeed: 500, observationToExecutionTicks: 5, bulletRange: 20000, predictShooterOrigin: true }
  );
  const movingShooterIntercept = quadraticInterceptCore(
    { x: 0, y: 0, vx: 50, vy: 0 },
    { x: 8000, y: 0, vx: 0, vy: 0 },
    { bulletSpeed: 500, observationToExecutionTicks: 5, bulletRange: 20000, predictShooterOrigin: true }
  );
  const oppositeIntercept = quadraticInterceptCore(
    { x: 0, y: 0, vx: -30, vy: 0 },
    { x: 8000, y: 0, vx: 30, vy: 0 },
    { bulletSpeed: 500, observationToExecutionTicks: 5, bulletRange: 20000, predictShooterOrigin: true }
  );
  const commandedTurnIntercept = quadraticInterceptCore(
    { x: 0, y: 0, vx: 50, vy: 0 },
    { x: 8000, y: 0, vx: 0, vy: 0 },
    {
      bulletSpeed: 500,
      observationToExecutionTicks: 5,
      bulletRange: 20000,
      predictShooterOrigin: true,
      shooterVelocity: { vx: 0, vy: 50 },
      shooterOriginSource: 'confirmed-command-direction'
    }
  );
  results.push({
    name: 'created-tick-shooter-origin-covers-parallel-static-opposite-and-commanded-turn',
    passed: Boolean(parallelIntercept
      && parallelIntercept.relativeExecutionDisplacement.x === 0
      && parallelIntercept.relativeExecutionDisplacement.y === 0
      && parallelIntercept.predictedShooterOrigin.x === 175
      && parallelIntercept.predictedTargetAtCreation.x === 8175
      && movingShooterIntercept?.predictedShooterOrigin.x === 250
      && movingShooterIntercept?.predictedTargetAtCreation.x === 8000
      && oppositeIntercept?.relativeExecutionDisplacement.x === 300
      && commandedTurnIntercept?.predictedShooterOrigin.x === 0
      && commandedTurnIntercept?.predictedShooterOrigin.y === 250
      && commandedTurnIntercept?.predictedShooterOrigin.source === 'confirmed-command-direction')
  });
  const highEntropyRisk = classifyFireRiskCore(null, {
    targetId: 8,
    nowMs: 1000,
    controlStyle: 'human-like',
    controlStyleConfidence: 0.9,
    maneuverScale: 0.7,
    maneuverDurationMs: 9000,
    lateralFlips: 8,
    routeSamples: 12,
    routeDistribution: [{ probability: 0.4 }, { probability: 0.35 }, { probability: 0.25 }]
  });
  const latchedRisk = classifyFireRiskCore(highEntropyRisk, {
    targetId: 8,
    nowMs: 1200,
    controlStyle: 'unknown',
    maneuverScale: 0,
    maneuverDurationMs: 0
  });
  const switchedRisk = classifyFireRiskCore(latchedRisk, {
    targetId: 9,
    nowMs: 1400,
    controlStyle: 'periodic-script',
    controlStyleConfidence: 0.9,
    maneuverScale: 0.05
  });
  const boundedDefense = evaluateHighEntropyFireGateCore({
    expectedHitProbability: 0.5,
    recentHitRate: 0,
    recentShotCount: 15,
    noProgressAcceptedShots: 20,
    noDamageMs: 12000,
    selfHp: 80,
    targetHp: 80,
    highEntropy: true,
    defensivePressure: true
  });
  results.push({
    name: 'fire-risk-classification-survives-affordability-gap-and-isolates-targets',
    passed: highEntropyRisk.highEntropy === true
      && latchedRisk.highEntropy === true
      && latchedRisk.latched === true
      && switchedRisk.highEntropy === false
      && boundedDefense.suppressFire === true
      && boundedDefense.reason === 'high-entropy-reacquire'
  });
  const standardCombatFire = resolveEstablishedCombatFireAuthorizationCore({
    targetPresent: true,
    aimOk: true,
    inRange: true,
    fireState: { state: 'normal', reason: 'normal-fire' },
    statisticalSuppression: {
      hitRate: 0,
      highEntropy: true,
      probeExhausted: true,
      coverageMarginalGain: 0,
      sharedBudgetRemaining: 0
    }
  });
  const dodgeReserveBlockedFire = resolveEstablishedCombatFireAuthorizationCore({
    targetPresent: true,
    aimOk: true,
    inRange: true,
    fireState: { state: 'paused', reason: 'close-pressure-movement-reserve' }
  });
  const physicallyUnreachableFire = resolveEstablishedCombatFireAuthorizationCore({
    targetPresent: true,
    aimOk: true,
    inRange: true,
    fireState: { state: 'normal', reason: 'normal-fire' },
    aim: { fireReachability: { reachable: false, reason: 'intercept-beyond-bullet-range' } }
  });
  results.push({
    name: 'established-combat-fire-ignores-statistical-gates-but-preserves-dodge-stamina-reserve',
    passed: standardCombatFire.wouldShoot === true
      && standardCombatFire.finalFireBlocker === 'none'
      && standardCombatFire.fireAuthorizationClass === 'standard-combat-fire'
      && dodgeReserveBlockedFire.wouldShoot === false
      && dodgeReserveBlockedFire.finalFireBlocker === 'fire-state:close-pressure-movement-reserve'
      && dodgeReserveBlockedFire.fireAuthorizationClass === 'stamina-reserve-blocked'
      && physicallyUnreachableFire.wouldShoot === false
      && physicallyUnreachableFire.finalFireBlocker === 'aim-unreachable:intercept-beyond-bullet-range'
  });
  const initialProbe = updateCombatProbePhaseCore(null, {
    nowMs: 1000,
    targetId: 8,
    acceptedShots: 0,
    confirmedHits: 0,
    shootingStamina: 0,
    highEntropy: true,
    behaviorMode: 'retreat-kite',
    directionState: 'east',
    routeContextKey: 'route-a',
    routeCandidate: 'continue',
    routeProbability: 0.2,
    predictedHitProbability: 0.04,
    distance: 12000,
    aimX: 100,
    aimY: 0
  });
  const lowQualityProbe = updateCombatProbePhaseCore(initialProbe, {
    nowMs: 1500,
    targetId: 8,
    acceptedShots: 3,
    confirmedHits: 0,
    shootingStamina: 1500,
    highEntropy: true,
    behaviorMode: 'retreat-kite',
    directionState: 'east',
    routeContextKey: 'route-a',
    routeCandidate: 'continue',
    routeProbability: 0.2,
    predictedHitProbability: 0.04,
    distance: 12000,
    aimX: 100,
    aimY: 0
  });
  const exhaustedProbe = updateCombatProbePhaseCore(lowQualityProbe, {
    nowMs: 2000,
    targetId: 8,
    acceptedShots: 5,
    confirmedHits: 0,
    shootingStamina: 2500,
    highEntropy: true,
    behaviorMode: 'retreat-kite',
    directionState: 'east',
    routeContextKey: 'route-a',
    routeCandidate: 'continue',
    routeProbability: 0.2,
    predictedHitProbability: 0.2,
    distance: 12000,
    aimX: 100,
    aimY: 0
  });
  const cadenceOnly = updateCombatProbePhaseCore(exhaustedProbe, {
    nowMs: 5000,
    targetId: 8,
    acceptedShots: 5,
    confirmedHits: 0,
    shootingStamina: 2500,
    highEntropy: true,
    behaviorMode: 'retreat-kite',
    directionState: 'east',
    routeContextKey: 'route-a',
    routeCandidate: 'continue',
    routeProbability: 0.2,
    predictedHitProbability: 0.2,
    distance: 12000,
    aimX: 100,
    aimY: 0
  });
  const novelGeometry = updateCombatProbePhaseCore(cadenceOnly, {
    nowMs: 7200,
    targetId: 8,
    acceptedShots: 5,
    confirmedHits: 0,
    shootingStamina: 2500,
    highEntropy: true,
    behaviorMode: 'stationary',
    directionState: 'stop',
    directionDwellTicks: 3,
    directionFlipAt: 7100,
    routeContextKey: 'route-b',
    routeCandidate: 'stop',
    routeProbability: 0.6,
    predictedHitProbability: 0.4,
    distance: 9000,
    aimX: 700,
    aimY: 0
  });
  results.push({
    name: 'combat-probe-phase-requires-probability-and-novel-geometry-instead-of-cadence-reset',
    passed: initialProbe.probePhase === 'probe'
      && initialProbe.suppressFire === false
      && lowQualityProbe.probePhase === 'wait-geometry'
      && lowQualityProbe.suppressionReason === 'probe-hit-probability-below-threshold'
      && exhaustedProbe.probePhase === 'cooldown'
      && exhaustedProbe.probeBudgetRemaining === 0
      && cadenceOnly.probePhase === 'cooldown'
      && cadenceOnly.probeResetReason === ''
      && novelGeometry.probePhase === 'probe'
      && novelGeometry.probeResetReason === 'mode:stationary'
      && novelGeometry.probeBudgetRemaining === 2
      && novelGeometry.geometryRearmCount === 1
      && novelGeometry.geometryNovelty === 1
  });

  const exhaustedGeometryReprobe = updateCombatProbePhaseCore(novelGeometry, {
    nowMs: 7600,
    targetId: 8,
    acceptedShots: 7,
    confirmedHits: 0,
    shootingStamina: 3500,
    highEntropy: true,
    behaviorMode: 'stationary',
    directionState: 'stop',
    directionDwellTicks: 5,
    directionFlipAt: 7100,
    routeContextKey: 'route-b',
    routeCandidate: 'stop',
    routeProbability: 0.6,
    predictedHitProbability: 0.4,
    distance: 9000,
    aimX: 700,
    aimY: 0
  });
  const routeChurnAfterExhaustion = updateCombatProbePhaseCore(exhaustedGeometryReprobe, {
    nowMs: 14000,
    targetId: 8,
    acceptedShots: 7,
    confirmedHits: 0,
    shootingStamina: 3500,
    highEntropy: true,
    behaviorMode: 'retreat-kite',
    directionState: 'west',
    directionDwellTicks: 4,
    directionFlipAt: 13900,
    routeContextKey: 'route-c',
    routeCandidate: 'lead-long',
    routeProbability: 0.8,
    predictedHitProbability: 0.5,
    distance: 12500,
    aimX: 1600,
    aimY: 400
  });
  const secondStableModeAfterExhaustion = updateCombatProbePhaseCore(routeChurnAfterExhaustion, {
    nowMs: 20000,
    targetId: 8,
    acceptedShots: 7,
    confirmedHits: 0,
    shootingStamina: 3500,
    highEntropy: true,
    behaviorMode: 'steady-linear',
    directionState: 'west',
    directionDwellTicks: 10,
    directionFlipAt: 13900,
    routeContextKey: 'route-d',
    routeCandidate: 'continue',
    routeProbability: 0.9,
    predictedHitProbability: 0.6,
    distance: 11000,
    aimX: 1900,
    aimY: 400
  });
  const attributedHitReset = updateCombatProbePhaseCore(secondStableModeAfterExhaustion, {
    nowMs: 20500,
    targetId: 8,
    acceptedShots: 20,
    confirmedHits: 1,
    shootingStamina: 10000,
    highEntropy: true,
    behaviorMode: 'retreat-kite',
    directionState: 'west',
    directionDwellTicks: 5,
    directionFlipAt: 13900,
    routeContextKey: 'route-c',
    routeCandidate: 'lead-long',
    routeProbability: 0.8,
    predictedHitProbability: 0.5,
    distance: 12500,
    aimX: 1600,
    aimY: 400
  });
  results.push({
    name: 'combat-probe-phase-bounds-geometry-rearm-until-attributed-hit',
    passed: exhaustedGeometryReprobe.probePhase === 'cooldown'
      && exhaustedGeometryReprobe.probeBudgetRemaining === 0
      && routeChurnAfterExhaustion.probePhase === 'cooldown'
      && routeChurnAfterExhaustion.probeResetReason === ''
      && routeChurnAfterExhaustion.probeBudgetRemaining === 0
      && routeChurnAfterExhaustion.geometryRearmCount === 1
      && secondStableModeAfterExhaustion.probePhase === 'cooldown'
      && secondStableModeAfterExhaustion.probeResetReason === ''
      && secondStableModeAfterExhaustion.geometryRearmCount === 1
      && attributedHitReset.probeResetReason === 'recent-attributed-hit'
      && attributedHitReset.probeBudgetRemaining === 5
      && attributedHitReset.geometryRearmCount === 0
  });

  const dodge = calculateDodgeDirection(
    { x: 0, y: 0 },
    [{ incoming: true, bullet_id: 'threat-1', ownerId: 8, createdTick: 10, expireTick: 30, x: -5000, y: 0, distance: 5000, cpa: 0, timeToImpact: 500, speed: 500, direction: { dx: 1, dy: 0 } }],
    { moveSpeedPerTick: 50, tickMs: 50, hitRadius: 200 }
  );
  const dodgeMinimumHits = Math.min(...dodge.threatField.map(item => item.directHits));
  results.push({
    name: 'future-position-threat-field-rejects-command-transition-hit',
    passed: dodge.directHits === undefined
      ? dodge.threatField.find(item => item.dx === dodge.dx && item.dy === dodge.dy)?.directHits === dodgeMinimumHits
        && dodgeMinimumHits === 1
        && dodge.threatField.some(item => item.dangerousBullets?.[0]?.currentHoldHit === false
          && item.dangerousBullets?.[0]?.expectedHit === true
          && item.scheduleRobust === false)
        && dodge.threatField.every(item => item.dangerousBullets?.[0]?.bulletId === 'threat-1')
        && dodge.threatField[0].dangerousBullets[0].ownerId === 8
        && dodge.threatField[0].dangerousBullets[0].createdTick === 10
        && dodge.threatField[0].dangerousBullets[0].expireTick === 30
        && dodge.threatField[0].dangerousBullets[0].speed === 500
      : false
  });
  const scheduleRobustDodge = calculateDodgeDirection(
    { x: 0, y: 0, vx: -50, vy: 0 },
    [{
      incoming: true,
      x: -3000,
      y: -3000,
      distance: 4243,
      cpa: 500,
      timeToImpact: 500,
      speed: 500,
      direction: { dx: Math.SQRT1_2, dy: Math.SQRT1_2 },
      remainingTicks: 15
    }],
    {
      moveSpeedPerTick: 50,
      tickMs: 50,
      hitRadius: 200,
      commandDelayTicks: 2,
      pendingVelocityCommands: [{ commandId: 'pending-west', dx: 1, dy: 0, effectiveAfterTicks: 2 }],
      movementExecutionTiming: { sampleCount: 10, medianTicks: 2, p90Ticks: 2, madTicks: 0 }
    }
  );
  const scheduleRisk = scheduleRobustDodge.threatField
    .find(item => item.dx === 1 && item.dy === -1)?.dangerousBullets?.[0];
  const uncertainTrajectory = calculateDodgeDirection(
    { x: 0, y: 0 },
    [{ incoming: true, distance: 1000, cpa: 250, timeToImpact: 500, trajectoryUncertaintyCm: 100 }],
    { hitRadius: 200 }
  );
  const stableTrajectory = calculateDodgeDirection(
    { x: 0, y: 0 },
    [{ incoming: true, distance: 1000, cpa: 250, timeToImpact: 500, trajectoryUncertaintyCm: 0 }],
    { hitRadius: 200 }
  );
  results.push({
    name: 'combat-dodge-rejects-false-safe-pending-schedule-and-clears-bounded-trajectory-uncertainty',
    passed: scheduleRisk?.expectedHit === false
      && scheduleRisk?.currentHoldHit === true
      && scheduleRobustDodge.threatField.find(item => item.dx === 1 && item.dy === -1)?.scheduleRobust === false
      && uncertainTrajectory.threatField.every(item => item.scheduleRobust === false)
      && stableTrajectory.threatField.every(item => item.scheduleRobust === true)
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
  const pendingCommandDodge = calculateDodgeDirection(
    { x: 0, y: 0, vx: 0, vy: 0 },
    [{
      incoming: true,
      x: -1000,
      y: 147,
      distance: 1011,
      cpa: 147,
      timeToImpact: 100,
      speed: 500,
      direction: { dx: 1, dy: 0 },
      remainingTicks: 4
    }],
    {
      moveSpeedPerTick: 50,
      tickMs: 50,
      hitRadius: 90,
      movementExecutionTiming: { sampleCount: 8, medianTicks: 1, p90Ticks: 5, madTicks: 0 },
      pendingVelocityCommands: [{ commandId: 2602, dx: 0, dy: 1, effectiveAfterTicks: 1 }]
    }
  );
  const pendingSelected = pendingCommandDodge.threatField.find(item => (
    item.dx === pendingCommandDodge.dx && item.dy === pendingCommandDodge.dy
  ));
  results.push({
    name: 'dodge-pending-old-command-reclassifies-july-18-tick-767375-false-safe',
    passed: pendingSelected?.directHits === 1
      && pendingSelected?.minCPA < 90
      && pendingSelected?.pendingVelocityCommand?.commandId === 2602
      && pendingSelected?.predictedVelocitySchedule?.[0]?.source === 'pending-command'
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
  const retreatInterceptInput = {
    self: { x: 0, y: 0 },
    target: { x: 6000, y: 0, vx: 20, vy: 0, active: true, authority: 'realtime' },
    opponentBehavior: { mode: 'retreat-kite', confidence: 0.9 },
    threatField: [{ dx: 1, dy: 0, directHits: 0, unavoidableHits: 0, worstCaseCpaCm: 500 }],
    selfSpeedPerTick: 100,
    minimumCpaCm: 200
  };
  const retreatInterceptShadow = safeRetreatInterceptCandidateCore(
    retreatInterceptInput.self,
    retreatInterceptInput.target,
    retreatInterceptInput
  );
  const retreatInterceptSnapshot = safeRetreatInterceptCandidateCore(
    retreatInterceptInput.self,
    { ...retreatInterceptInput.target, authority: 'snapshot' },
    retreatInterceptInput
  );
  const retreatInterceptZigzag = safeRetreatInterceptCandidateCore(
    retreatInterceptInput.self,
    retreatInterceptInput.target,
    { ...retreatInterceptInput, opponentBehavior: { mode: 'zigzag-strafe', confidence: 0.95 } }
  );
  const retreatInterceptDamaged = safeRetreatInterceptCandidateCore(
    retreatInterceptInput.self,
    retreatInterceptInput.target,
    { ...retreatInterceptInput, selfHpLossObserved: true }
  );
  const retreatInterceptDanger = safeRetreatInterceptCandidateCore(
    retreatInterceptInput.self,
    retreatInterceptInput.target,
    { ...retreatInterceptInput, threatField: [{ dx: 1, dy: 0, directHits: 1, unavoidableHits: 0, worstCaseCpaCm: 50 }] }
  );
  results.push({
    name: 'safe-retreat-intercept-is-realtime-shadow-only-and-collision-first',
    passed: retreatInterceptShadow.eligible === true
      && retreatInterceptShadow.shadow === true
      && retreatInterceptShadow.applied === false
      && retreatInterceptSnapshot.reason === 'target-not-realtime-visible'
      && retreatInterceptZigzag.reason === 'retreat-kite-not-confirmed'
      && retreatInterceptDamaged.reason === 'recent-self-damage'
      && retreatInterceptDanger.reason === 'collision-pressure-present'
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

  const creationOracleBase = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    authority: 'realtime'
  };
  const creationOracle = (distance, extra = {}, options = {}) => solveInterceptAtCreationCore(
    creationOracleBase,
    { x: distance, y: 0, vx: 0, vy: 0, authority: 'realtime', ...extra },
    {
      bulletSpeedCmPerTick: 500,
      bulletRangeCm: 15000,
      bulletLifetimeTicks: 30,
      hitRadiusCm: 90,
      creationDelayTicks: 0,
      nowMs: 1000,
      realtimeStateObservedAtMs: 1000,
      ...options
    }
  );
  const oracle14910 = creationOracle(14910);
  const oracle15000 = creationOracle(15000);
  const oracle15090 = creationOracle(15090);
  const oracle15100 = creationOracle(15100);
  const oracleNoPositiveRoot = creationOracle(1000, { vx: 600 });
  const oracleStale = creationOracle(1000, {}, { realtimeStateAgeMs: 501 });
  const oracleStableStationaryWindow = creationOracle(1000, {}, {
    creationDelayMinTicks: 1,
    creationDelayMaxTicks: 6,
    maxCreationWindowTicks: 4
  });
  const oracleUnstableWindow = creationOracle(1000, { vx: 50 }, {
    creationDelayMinTicks: 1,
    creationDelayMaxTicks: 6,
    maxCreationWindowTicks: 4
  });
  const aimEdge = evaluateAimPointReachabilityCore(
    { x: 0, y: 0 },
    { x: 15090, y: 0 },
    { bulletSpeedCmPerTick: 500, bulletRangeCm: 15000, bulletLifetimeTicks: 30, hitRadiusCm: 90 }
  );
  results.push({
    name: 'created-tick-reachability-oracle-covers-range-lifetime-staleness-and-window-boundaries',
    passed: oracle14910.reachable === true
      && oracle15000.reachable === true
      && oracle15090.reachable === true
      && oracle15090.edgeToleranceCm === 90
      && oracle15100.reachable === false
      && oracle15100.reason === 'intercept-beyond-bullet-range'
      && oracleNoPositiveRoot.reason === 'no-positive-intercept'
      && oracleStale.reason === 'stale-realtime-state'
      && oracleStableStationaryWindow.reachable === true
      && oracleUnstableWindow.reason === 'creation-window-unstable'
      && aimEdge.reachable === true
  });

  const distanceAwareReaction = {
    currentShotAvoidability: 'safe',
    threateningBulletCount: 0,
    currentDirectionSafe: false,
    pendingDirectionSafe: false,
    nextVolleyMinCpaCm: 100,
    reactionSlackMs: -50,
    prospectiveReactionSlackMs: -50,
    commandBudgetMs: 100,
    pendingCommandSchedule: []
  };
  const distanceAwareThreatField = [
    { dx: 1, dy: 1, directHits: 0, unavoidableHits: 0, scheduleRobust: true, worstCaseCpaCm: 320, minCPA: 320 },
    { dx: 1, dy: -1, directHits: 0, unavoidableHits: 0, scheduleRobust: true, worstCaseCpaCm: 310, minCPA: 310 },
    { dx: 0, dy: 1, directHits: 0, unavoidableHits: 0, scheduleRobust: true, worstCaseCpaCm: 500, minCPA: 500 }
  ];
  let stochasticCalls = 0;
  const stochasticRng = () => {
    stochasticCalls += 1;
    return 0.25;
  };
  const distanceAwareInput = {
    nowMs: 1000,
    targetId: 'target-a',
    engagementId: 'engagement-a',
    activeOpponent: true,
    baseMovement: { dx: 1, dy: 0 },
    currentDirection: { dx: 0, dy: 0 },
    radialIntentVector: { dx: 1, dy: 0 },
    reactionSlack: distanceAwareReaction,
    threatField: distanceAwareThreatField,
    nextShotInMs: 100,
    shotSampleCount: 0
  };
  const firstDistanceAware = resolveDistanceAwareDodgeCore(distanceAwareInput, {
    rng: stochasticRng,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 500
  });
  const latchedDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    nowMs: 1050,
    previousState: firstDistanceAware.state
  }, {
    rng: () => {
      stochasticCalls += 100;
      return 0.9;
    },
    minimumCpaCm: 200,
    latchMinimumHoldMs: 500
  });
  const stabilityThreatField = [
    { dx: 0, dy: 1, directHits: 0, unavoidableHits: 0, scheduleRobust: true, minCPA: 320 },
    { dx: 0, dy: -1, directHits: 0, unavoidableHits: 0, scheduleRobust: true, minCPA: 310 }
  ];
  const stabilityFirst = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    baseMovement: { dx: 0, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    radialIntentVector: { dx: 0, dy: 0 },
    threatField: stabilityThreatField
  }, {
    rng: () => 0,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 200,
    directionStabilityWindowMs: 500
  });
  const stabilitySecond = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    nowMs: 1100,
    baseMovement: { dx: 0, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    radialIntentVector: { dx: 0, dy: 0 },
    threatField: stabilityThreatField.slice().reverse(),
    previousState: { ...stabilityFirst.state, latch: null }
  }, {
    rng: () => 0,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 200,
    directionStabilityWindowMs: 500
  });
  const boundaryDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    boundaryRisk: true
  }, { rng: () => { throw new Error('boundary risk must block pre-dodge'); } });
  const collisionDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    collisionRisk: true
  }, { rng: () => { throw new Error('collision risk must block pre-dodge'); } });
  const unavoidableDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    reactionSlack: {
      ...distanceAwareReaction,
      currentShotAvoidability: 'unavoidable',
      threateningBulletCount: 1
    },
    dodge: { dx: -1, dy: 0 },
    previousState: firstDistanceAware.state
  }, {
    rng: stochasticRng,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 500
  });
  const noEvidenceDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    threatField: undefined
  }, { rng: stochasticRng, minimumCpaCm: 200, latchMinimumHoldMs: 500 });
  const noCadenceCloseUnsafe = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    self: { x: 0, y: 0, vx: 0, vy: 0 },
    target: { x: 4000, y: 0, vx: 0, vy: 0 },
    baseDistanceBand: 'approach',
    nextShotInMs: null,
    shotSampleCount: 0,
    threatField: undefined
  }, {
    rng: () => 0.25,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 500,
    moveSpeedPerTick: 50,
    bulletSpeedCmPerTick: 500
  });
  const lowConfidenceWindowStochastic = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    self: { x: 0, y: 0, vx: 0, vy: 0 },
    target: { x: 4000, y: 0, vx: 0, vy: 0 },
    baseDistanceBand: 'approach',
    nextShotInMs: 250,
    shotSampleCount: 1,
    threatField: undefined
  }, {
    rng: () => 0.25,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 500,
    moveSpeedPerTick: 50,
    bulletSpeedCmPerTick: 500
  });
  const staleDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    reactionSlack: { ...distanceAwareReaction, observationAgeMs: 501 }
  }, { rng: () => 0.25, minimumCpaCm: 200 });
  const recedingDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    self: { x: 0, y: 0, vx: 0, vy: 0 },
    target: { x: 4000, y: 0, vx: 50, vy: 0 },
    threatField: undefined,
    nextShotInMs: 250,
    shotSampleCount: 1
  }, { rng: () => 0.25, minimumCpaCm: 200 });
  const tangentialDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    self: { x: 0, y: 0, vx: 0, vy: 0 },
    target: { x: 4000, y: 0, vx: 0, vy: 50 },
    threatField: undefined,
    nextShotInMs: 250,
    shotSampleCount: 1
  }, { rng: () => 0.25, minimumCpaCm: 200 });
  const causalPredictiveDistanceAware = resolveDistanceAwareDodgeCore({
    ...distanceAwareInput,
    self: { x: 0, y: 0, vx: 50, vy: 0 },
    target: { x: 8000, y: 0, vx: 0, vy: 0 },
    nextShotInMs: 100,
    shotSampleCount: 4,
    shotIntervalCv: 0.1,
    threatField: undefined
  }, {
    rng: stochasticRng,
    minimumCpaCm: 200,
    latchMinimumHoldMs: 500,
    moveSpeedPerTick: 50,
    bulletSpeedCmPerTick: 500
  });
  const distanceAwareModeStart = classifyDistanceAwareDodgeModeCore({
    nowMs: 1000,
    targetId: 'target-a',
    engagementId: 'engagement-a',
    previousState: { targetId: 'target-a', engagementId: 'engagement-a', mode: 'long-observe', modeSinceMs: 900 },
    reactionSlack: {
      ...distanceAwareReaction,
      threateningBulletCount: 1,
      currentShotAvoidability: 'safe',
      reactionSlackMs: 100,
      prospectiveReactionSlackMs: 100
    }
  }, { modeMinimumHoldMs: 300 });
  const distanceAwareModeAfterHold = classifyDistanceAwareDodgeModeCore({
    nowMs: 1301,
    targetId: 'target-a',
    engagementId: 'engagement-a',
    previousState: distanceAwareModeStart.state,
    reactionSlack: {
      ...distanceAwareReaction,
      threateningBulletCount: 1,
      currentShotAvoidability: 'safe',
      reactionSlackMs: 100,
      prospectiveReactionSlackMs: 100
    }
  }, { modeMinimumHoldMs: 300 });
  const reactionBudget = deriveCombatReactionBudgetCore({
    nowMs: 1000,
    realtimeStateObservedAtMs: 900,
    movementExecutionTiming: { sampleCount: 8, medianTicks: 3, p90Ticks: 5 },
    pendingVelocityCommands: [{ commandId: 'pending-1', dx: 1, dy: 0, effectiveAfterTicks: 3 }]
  }, { tickMs: 50 });
  const predictedWindow = predictNextFireWindowCore({
    nowMs: 1000,
    nextShotInMs: 200,
    shotSampleCount: 4,
    shotIntervalCv: 0.1
  });
  const seededLeftRight = Array.from({ length: 1000 }, (_, index) => {
    const selection = selectStochasticDodgeCandidateCore([
      { dx: -1, dy: 0, safe: true, minCpaCm: 300 },
      { dx: 1, dy: 0, safe: true, minCpaCm: 300 }
    ], { rng: createSeededRandomCore(Math.imul(index + 1, 0x9e3779b1)) });
    return selection.selected?.dx;
  });
  const leftCount = seededLeftRight.filter(direction => direction === -1).length;
  const rightCount = seededLeftRight.filter(direction => direction === 1).length;
  results.push({
    name: 'distance-aware-dodge-preserves-radial-intent-and-latches-one-stochastic-sample',
    passed: firstDistanceAware.mode === 'close-proactive'
      && firstDistanceAware.closeSubmode === 'stochastic'
      && firstDistanceAware.applied === true
      && firstDistanceAware.direction.dx === 1
      && firstDistanceAware.direction.dy !== 0
      && latchedDistanceAware.preDodgeReason === 'latched-pre-dodge'
      && latchedDistanceAware.randomChoice?.unit === firstDistanceAware.randomChoice?.unit
      && stabilityFirst.applied === true
      && stabilitySecond.direction.dy === stabilityFirst.direction.dy
      && stabilitySecond.directionStabilityHeld === true
      && stabilitySecond.preDodgeReason === 'direction-stability-hold'
      && stabilitySecond.state.lastAppliedAtMs === stabilityFirst.state.lastAppliedAtMs
      && boundaryDistanceAware.applied === false
      && boundaryDistanceAware.preDodgeReason === 'boundary-risk'
      && collisionDistanceAware.applied === false
      && collisionDistanceAware.preDodgeReason === 'collision-risk'
      && stochasticCalls === 1
      && unavoidableDistanceAware.applied === false
      && unavoidableDistanceAware.preDodgeReason === 'unavoidable-current-shot'
      && unavoidableDistanceAware.suppressCurrentShotDodge === true
      && unavoidableDistanceAware.direction.dx === 0
      && unavoidableDistanceAware.direction.dy === 0
      && unavoidableDistanceAware.state.latch === null
      && noEvidenceDistanceAware.applied === false
      && noEvidenceDistanceAware.preDodgeReason === 'no-safe-lateral-candidate'
      && noCadenceCloseUnsafe.applied === false
      && noCadenceCloseUnsafe.preDodgeReason === 'no-safe-lateral-candidate'
      && noCadenceCloseUnsafe.predictedThreatSource === 'causal-close-envelope-counterfactual'
      && lowConfidenceWindowStochastic.applied === true
      && lowConfidenceWindowStochastic.closeSubmode === 'stochastic'
      && lowConfidenceWindowStochastic.predictedThreatSource === 'causal-low-confidence-fire-window'
      && lowConfidenceWindowStochastic.baseDistanceBand === 'approach'
      && staleDistanceAware.applied === false
      && staleDistanceAware.preDodgeReason === 'stale-realtime-state'
      && recedingDistanceAware.applied === false
      && recedingDistanceAware.preDodgeReason === 'receding-without-threat-evidence'
      && tangentialDistanceAware.applied === false
      && tangentialDistanceAware.preDodgeReason === 'tangential-without-threat-evidence'
      && causalPredictiveDistanceAware.applied === true
      && causalPredictiveDistanceAware.closeSubmode === 'predictive'
      && causalPredictiveDistanceAware.preDodgeReason === 'predicted-next-fire-window'
      && causalPredictiveDistanceAware.predictedThreatSource === 'causal-next-fire-window'
      && distanceAwareModeStart.mode === 'long-observe'
      && distanceAwareModeStart.held === true
      && distanceAwareModeAfterHold.mode === 'medium-reactive'
      && reactionBudget.commandBudgetTicks === 13
      && reactionBudget.observationAgeMs === 100
      && predictedWindow.predictiveEligible === true
      && leftCount >= 450
      && leftCount <= 550
      && rightCount >= 450
      && rightCount <= 550
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
  const hardBoundaryFocus = buildActionFocus({ kind: 'leave', band: 'safety', reason: 'outside-center-hard-boundary-leave' }, { nowMs: 1000 });
  results.push({
    name: 'action-priority-prefers-standard-explicit-band-without-center-return-special-case',
    passed: combatFocus.band === 'combat'
      && hardBoundaryFocus.band === 'safety'
      && getActionPriorityBand({ kind: 'combat-live' }) === 'combat'
      && getActionPriorityBand({ kind: 'combat-candidate' }) === 'combat'
      && getActionPriorityBand({ kind: 'safety-exit' }) === 'safety'
      && getActionPriorityBand({ kind: 'patrol', reason: 'return-to-center-activity-radius' }) === 'patrol'
      && [combatFocus.band, hardBoundaryFocus.band].every(value => Object.values(ACTION_PRIORITY_BANDS).includes(value))
  });

  const selectedCombatCandidate = selectFinalActionCandidateCore([
    buildFinalActionCandidate({ kind: 'recover', band: 'recover', reason: 'wait-for-full-stamina-and-hp' }, { order: 190 }),
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
  const closePressureState = {
    combatTarget: {
      ...edgeEngaged,
      at: 30000,
      lastInRangeAt: 15000,
      combatPhase: 'close-pressure',
      closePressure: { active: true, phase: 'close-pressure' }
    }
  };
  const closePressureInsideDisengageTarget = pickEngagedCombatTargetCore(
    edgeSelf,
    [],
    [{
      ...edgeTarget,
      x: 16000,
      distance: 16000,
      active: false
    }],
    [],
    closePressureState,
    {
      nowMs: 40000,
      targetStickMs: 5000,
      combatEngageStickMs: 30000,
      combatEngageGraceMs: 5000,
      combatEngageGraceRange: 17000,
      combatDisengageRange: 17000,
      combatAttackRange: 14500
    }
  );
  results.push({
    name: 'close-pressure-retains-visible-target-inside-disengage-range',
    passed: closePressureInsideDisengageTarget?.user_id === 2
      && closePressureInsideDisengageTarget?.combatIntent === 'reengage'
      && closePressureInsideDisengageTarget?.combatEngagement?.closePressureHold === true
      && closePressureState.combatTarget?.id === 2
  });
  const closePressureFarState = {
    combatTarget: {
      ...edgeEngaged,
      at: 30000,
      lastInRangeAt: 15000,
      combatPhase: 'close-pressure',
      closePressure: { active: true, phase: 'close-pressure' }
    }
  };
  const closePressureBeyondDisengageTarget = pickEngagedCombatTargetCore(
    edgeSelf,
    [],
    [{
      ...edgeTarget,
      x: 20828,
      distance: 20828,
      active: false
    }],
    [],
    closePressureFarState,
    {
      nowMs: 40000,
      targetStickMs: 5000,
      combatEngageStickMs: 30000,
      combatEngageGraceMs: 5000,
      combatEngageGraceRange: 17000,
      combatDisengageRange: 17000,
      combatAttackRange: 14500
    }
  );
  results.push({
    name: 'close-pressure-retains-visible-target-beyond-legacy-disengage-range-for-bounded-distance-control',
    passed: closePressureBeyondDisengageTarget?.user_id === 2
      && closePressureBeyondDisengageTarget?.combatIntent === 'reengage'
      && closePressureBeyondDisengageTarget?.combatEngagement?.closePressureHold === true
      && closePressureBeyondDisengageTarget?.combatEngagement?.distanceControlBeyondLegacyDisengage === true
      && closePressureFarState.combatTarget?.id === 2
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

  const shortExchangeFirst = evaluateCombatExchangeStopLossCore({
    nowMs: 10000,
    engagedMs: 10000,
    acceptedShots: 12,
    damageObservations: 5,
    selfHp: 82,
    targetHp: 94,
    windowMs: 10000,
    windowSelfDamage: 18,
    windowTargetDamage: 3,
    longWindowSelfDamage: 18,
    longWindowTargetDamage: 3,
    recentTargetDamage: 0
  });
  const shortExchangeLater = evaluateCombatExchangeStopLossCore({
    nowMs: 13000,
    engagedMs: 13000,
    acceptedShots: 16,
    damageObservations: 6,
    selfHp: 79,
    targetHp: 91,
    windowMs: 10000,
    windowSelfDamage: 21,
    windowTargetDamage: 4,
    longWindowSelfDamage: 21,
    longWindowTargetDamage: 4,
    degradationSinceAt: shortExchangeFirst.degradationSinceAt
  });
  const protectedFinish = evaluateCombatExchangeStopLossCore({
    nowMs: 13000,
    engagedMs: 13000,
    acceptedShots: 16,
    damageObservations: 6,
    selfHp: 45,
    targetHp: 15,
    windowSelfDamage: 3,
    windowTargetDamage: 6,
    recentTargetDamage: 3
  });
  results.push({
    name: 'combat-exchange-does-not-forecast-from-short-window-hp-velocity',
    passed: shortExchangeFirst.active === false
      && shortExchangeFirst.triggered === false
      && shortExchangeLater.active === false
      && shortExchangeLater.triggered === false
      && protectedFinish.lowHpFinishProtected === true
      && protectedFinish.triggered === false
  });
  const severePoorExchange = evaluateCombatExchangeStopLossCore({
    nowMs: 62001,
    engagedMs: 60001,
    acceptedShots: 50,
    damageObservations: 12,
    selfHp: 58,
    targetHp: 70,
    cumulativeSelfDamage: 42,
    cumulativeTargetDamage: 15,
    recentTargetDamage: 3
  });
  const poorExchangeBoundaries = [
    { engagedMs: 60000, selfHp: 58, targetHp: 70, cumulativeSelfDamage: 42, cumulativeTargetDamage: 15 },
    { engagedMs: 60001, selfHp: 60, targetHp: 70, cumulativeSelfDamage: 42, cumulativeTargetDamage: 15 },
    { engagedMs: 60001, selfHp: 58, targetHp: 40, cumulativeSelfDamage: 42, cumulativeTargetDamage: 15 },
    { engagedMs: 60001, selfHp: 58, targetHp: 70, cumulativeSelfDamage: 15, cumulativeTargetDamage: 10 }
  ].map(item => evaluateCombatExchangeStopLossCore({
    nowMs: 62001,
    acceptedShots: 50,
    damageObservations: 12,
    recentTargetDamage: 3,
    ...item
  }));
  results.push({
    name: 'combat-exchange-stop-loss-exits-only-after-severe-cumulative-boundaries',
    passed: severePoorExchange.severePoorExchange === true
      && severePoorExchange.shouldExit === true
      && severePoorExchange.phase === 'exit'
      && severePoorExchange.phasedReason === 'combat-exit-poor-exchange'
      && severePoorExchange.cumulativeDamageRatio === 2.8
      && poorExchangeBoundaries.every(item => item.severePoorExchange === false && item.shouldExit === false)
  });
  const severeCumulativeReversalInput = {
    nowMs: 65000,
    engagedMs: 64000,
    acceptedShots: 80,
    damageObservations: 8,
    selfHp: 58,
    targetHp: 23,
    longWindowSelfDamage: 12,
    longWindowTargetDamage: 3,
    cumulativeSelfDamage: 42,
    cumulativeTargetDamage: 12,
    recentTargetDamage: 0,
    recentThreatBulletCount: 4,
    defensive: true,
    closePressure: true
  };
  const severeCumulativeReversal = evaluateCombatExchangeStopLossCore(severeCumulativeReversalInput);
  const identityRemappedReversal = evaluateCombatExchangeStopLossCore({
    ...severeCumulativeReversalInput,
    targetId: 'remapped-target',
    targetName: 'remapped-name'
  });
  const closePressureCannotOverrideReversal = evaluateCombatExchangeStopLossCore(
    severeCumulativeReversalInput,
    { closePressureMinSelfHp: 50 }
  );
  const cumulativeReversalControls = [
    { engagedMs: 60000 },
    { selfHp: 60 },
    { cumulativeSelfDamage: 18, cumulativeTargetDamage: 12 },
    { longWindowSelfDamage: 11 },
    { longWindowTargetDamage: 4 },
    { recentTargetDamage: 3 },
    { recentThreatBulletCount: 0 },
    { defensive: false },
    { targetHp: 15, recentTargetDamage: 3 }
  ].map(overrides => evaluateCombatExchangeStopLossCore({
    ...severeCumulativeReversalInput,
    ...overrides
  }));
  results.push({
    name: 'combat-exchange-exits-severe-low-target-hp-cumulative-reversal-only-with-current-pressure',
    passed: severeCumulativeReversal.severeCumulativeReversal === true
      && severeCumulativeReversal.severePoorExchangeRule === 'severe-cumulative-reversal'
      && severeCumulativeReversal.shouldExit === true
      && severeCumulativeReversal.phasedReason === 'combat-exit-poor-exchange'
      && severeCumulativeReversal.closePressureContinuation === false
      && severeCumulativeReversal.severeCumulativeReversalQualification.realtimePressure === true
      && severeCumulativeReversal.severeCumulativeReversalQualification.recentNoHit === true
      && identityRemappedReversal.severeCumulativeReversal === true
      && closePressureCannotOverrideReversal.closePressureContinuation === true
      && closePressureCannotOverrideReversal.shouldExit === true
      && cumulativeReversalControls.every(item => item.severeCumulativeReversal === false && item.shouldExit === false)
  });
  const defensiveRetreat = evaluateCombatExchangeStopLossCore({
    nowMs: 45000,
    engagedMs: 45000,
    acceptedShots: 40,
    damageObservations: 5,
    selfHp: 70,
    targetHp: 100,
    windowMs: 10000,
    windowSelfDamage: 3,
    windowTargetDamage: 0,
    longWindowSelfDamage: 12,
    longWindowTargetDamage: 0,
    cumulativeSelfDamage: 12,
    cumulativeTargetDamage: 0,
    recentTargetDamage: 0,
    distance: 14000,
    recentThreatBulletCount: 2,
    defensive: true
  });
  const defensiveExit = evaluateCombatExchangeStopLossCore({
    nowMs: 60000,
    engagedMs: 60000,
    acceptedShots: 40,
    damageObservations: 5,
    selfHp: 67,
    targetHp: 100,
    cumulativeSelfDamage: 15,
    cumulativeTargetDamage: 0,
    recentTargetDamage: 0,
    distance: 15000,
    recentThreatBulletCount: 1,
    defensive: true,
    retreatSinceAt: defensiveRetreat.retreatSinceAt,
    retreatSelfDamageBaseline: defensiveRetreat.retreatSelfDamageBaseline,
    retreatTargetDamageBaseline: defensiveRetreat.retreatTargetDamageBaseline
  });
  const safelySeparated = evaluateCombatExchangeStopLossCore({
    nowMs: 60000,
    engagedMs: 60000,
    acceptedShots: 40,
    damageObservations: 5,
    selfHp: 67,
    targetHp: 100,
    cumulativeSelfDamage: 15,
    cumulativeTargetDamage: 0,
    recentTargetDamage: 0,
    distance: 18000,
    recentThreatBulletCount: 0,
    defensive: true,
    retreatSinceAt: defensiveRetreat.retreatSinceAt,
    retreatSelfDamageBaseline: defensiveRetreat.retreatSelfDamageBaseline,
    retreatTargetDamageBaseline: defensiveRetreat.retreatTargetDamageBaseline
  });
  results.push({
    name: 'defensive-combat-exchange-stop-loss-retreats-then-exits-unless-safely-separated',
    passed: defensiveRetreat.phase === 'retreat'
      && defensiveRetreat.disengage === true
      && defensiveRetreat.shouldExit === false
      && defensiveExit.phase === 'exit'
      && defensiveExit.shouldExit === true
      && defensiveExit.phasedReason === 'defensive-exchange-no-progress-leave'
      && safelySeparated.disengage === true
      && safelySeparated.safeDistanceReached === true
      && safelySeparated.shouldExit === false
  });

  const pressureBefore = combatPressurePhaseCore({
    id: '8',
    combatPhase: 'normal-combat',
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 100,
    damageProgressAt: 1000
  }, {
    targetId: '8',
    nowMs: 30999,
    engagedAt: 1000,
    originIntent: 'profit',
    damageFromStart: 0,
    damageKnown: true,
    damageProgressAt: 1000,
    acceptedShotsSinceDamage: 99,
    distance: 12000
  }, { combatEfficiencyWindowMs: 30000 });
  const pressureAt = combatPressurePhaseCore({
    id: '8',
    combatPhase: 'normal-combat',
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 100,
    damageProgressAt: 1000
  }, {
    targetId: '8',
    nowMs: 31000,
    engagedAt: 1000,
    originIntent: 'profit',
    damageFromStart: 0,
    damageKnown: true,
    damageProgressAt: 1000,
    acceptedShotsSinceDamage: 0,
    distance: 12000
  }, { combatEfficiencyWindowMs: 30000 });
  const pressureRange = combatPressureTargetRangeCore({
    combatControlIntervalMs: 50,
    combatServerTickMs: 50,
    combatBulletSpeedPerTick: 500,
    combatMoveSpeedPerTick: 50,
    combatBulletHitRadiusCm: 90,
    movementExecutionTiming: { p90Ticks: 5 },
    combatFrameJitterMs: 50,
    combatReactionSafetyMarginMs: 100,
    combatClosePressureMinRangeCm: 4500,
    combatClosePressureMaxRangeCm: 5500
  });
  const ballisticClose = combatBallisticCloseCore({
    targetId: '8',
    nowMs: 5000,
    distanceCm: 5000,
    noDamageMs: 4000,
    acceptedShotsSinceDamage: 12,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    passiveRunnerConfirmed: true,
    ordinaryProfit: true,
    directionDwells: [350, 400, 400, 450]
  });
  const ballisticCloseLatched = combatBallisticCloseCore({
    targetId: '8',
    previousState: ballisticClose.state,
    nowMs: 5100,
    distanceCm: 4200,
    noDamageMs: 4100,
    acceptedShotsSinceDamage: 13,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    passiveRunnerConfirmed: false,
    ordinaryProfit: true,
    directionDwells: [350, 400, 400, 450]
  });
  const ballisticCloseThreatRelease = combatBallisticCloseCore({
    targetId: '8',
    previousState: ballisticClose.state,
    nowMs: 5200,
    distanceCm: 4200,
    noDamageMs: 4200,
    acceptedShotsSinceDamage: 14,
    selfHp: 100,
    targetFiring: true,
    targetBulletPressure: true,
    persistentThreat: true,
    passiveRunnerConfirmed: false,
    ordinaryProfit: true,
    directionDwells: [350, 400, 400, 450]
  });
  const ballisticCloseStableMotion = combatBallisticCloseCore({
    targetId: '9',
    nowMs: 5000,
    distanceCm: 4000,
    noDamageMs: 4000,
    acceptedShotsSinceDamage: 12,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    passiveRunnerConfirmed: true,
    ordinaryProfit: true,
    directionDwells: [1300, 1400, 1500, 1600]
  });
  const ballisticCloseEconomicPhase = combatBallisticCloseCore({
    targetId: '8',
    previousState: ballisticClose.state,
    nowMs: 35000,
    distanceCm: 3200,
    noDamageMs: 34000,
    acceptedShotsSinceDamage: 60,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    passiveRunnerConfirmed: false,
    ordinaryProfit: true,
    directionDwells: [350, 400, 400, 450]
  });
  const pressureStrafeA = combatPressureStrafeCore(
    { x: 0, y: 0 },
    { id: '8', x: 2500, y: 0 },
    { targetId: '8', phaseStartedAt: 60000 },
    { nowMs: 60000 }
  );
  const pressureStrafeNext = combatPressureStrafeCore(
    { x: 0, y: 0 },
    { id: '8', x: 2500, y: 0 },
    { targetId: '8', phaseStartedAt: 60000 },
    { nowMs: 60420 }
  );
  const pressureStrafeB = combatPressureStrafeCore(
    { x: 0, y: 0 },
    { id: '8', x: 2500, y: 0 },
    { targetId: '8', phaseStartedAt: 60000 },
    { nowMs: 63500 }
  );
  const pressureStrafeLong = combatPressureStrafeCore(
    { x: 0, y: 0 },
    { id: '8', x: 2500, y: 100 },
    { targetId: '8', phaseStartedAt: 60000 },
    { nowMs: 660000 }
  );
  results.push({
    name: 'combat-efficiency-close-starts-after-thirty-seconds-regardless-of-shot-count-at-derived-range',
    passed: pressureBefore.phase === 'normal-combat'
      && pressureAt.phase === 'close-pressure'
      && pressureAt.triggerReason === 'low-damage-efficiency-window-threshold'
      && pressureAt.stepIndex === 1
      && pressureAt.stepStartDistanceCm === 12000
      && pressureAt.goalDistanceCm === 5000
      && pressureAt.stepCm === 1000
      && pressureAt.timeoutMs === 30000
      && pressureAt.pressureAttackCommitted === true
      && pressureRange.clearanceTicks === 2
      && pressureRange.zeroLatencyUnreliableRangeCm === 1000
      && pressureRange.responseBudgetMs === 550
      && pressureRange.reactiveBoundaryCm === 5500
      && pressureRange.normalMinRangeCm === 6000
      && pressureRange.normalMaxRangeCm === 6500
      && pressureRange.minRangeCm === 4500
      && pressureRange.rangeCm === 5000
      && pressureRange.maxRangeCm === 5500
      && pressureRange.flightMs <= pressureRange.responseBudgetMs
      && pressureRange.ballisticConstraintSatisfied === true
      && pressureStrafeA.active === true
      && pressureStrafeB.active === true
      && pressureStrafeA.dx === pressureStrafeB.dx
      && pressureStrafeA.dy === -pressureStrafeB.dy
      && pressureStrafeNext.dy === -pressureStrafeA.dy
      && pressureStrafeLong.active === true
      && pressureStrafeLong.segmentIndex > 128
      && pressureStrafeLong.dx === 0
      && Math.abs(pressureStrafeLong.dy) === 1
  });
  results.push({
    name: 'combat-ballistic-close-uses-fast-direction-dwells-latches-stops-and-releases-threats',
    passed: ballisticClose.active === true
      && ballisticClose.reason === 'projectile-flight-exceeds-direction-dwell'
      && ballisticClose.targetRangeCm === 3000
      && ballisticClose.targetFlightMs === 300
      && ballisticClose.currentFlightMs === 500
      && ballisticCloseLatched.active === true
      && ballisticCloseLatched.latched === true
      && ballisticCloseLatched.targetRangeCm === 3000
      && ballisticCloseThreatRelease.active === false
      && ballisticCloseThreatRelease.reason === 'target-firing'
      && ballisticCloseStableMotion.active === false
      && ballisticCloseStableMotion.reason === 'flight-shorter-than-direction-dwell'
      && ballisticCloseEconomicPhase.active === true
      && ballisticCloseEconomicPhase.latched === true
  });
  const defensiveBallisticClose = combatBallisticCloseCore({
    targetId: 'defensive-8',
    nowMs: 5000,
    distanceCm: 5000,
    noDamageMs: 4000,
    selfNoDamageMs: 4000,
    acceptedShotsSinceDamage: 12,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    recentSelfDamage: false,
    passiveRunnerConfirmed: false,
    originIntent: 'defensive',
    currentIntent: 'engaged',
    ordinaryProfit: false,
    directionDwells: [350, 400, 400, 450]
  });
  const defensiveRelease = combatBallisticCloseCore({
    targetId: 'defensive-8',
    previousState: defensiveBallisticClose.state,
    nowMs: 5100,
    distanceCm: 4200,
    noDamageMs: 4100,
    selfNoDamageMs: 100,
    acceptedShotsSinceDamage: 13,
    selfHp: 79,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    recentSelfDamage: true,
    passiveRunnerConfirmed: false,
    originIntent: 'defensive',
    currentIntent: 'reengage',
    ordinaryProfit: false,
    directionDwells: [350, 400, 400, 450]
  });
  const defensiveBulletRelease = combatBallisticCloseCore({
    targetId: 'defensive-8',
    previousState: defensiveBallisticClose.state,
    nowMs: 5200,
    distanceCm: 4200,
    noDamageMs: 4200,
    selfNoDamageMs: 4200,
    acceptedShotsSinceDamage: 14,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: true,
    persistentThreat: false,
    recentSelfDamage: false,
    passiveRunnerConfirmed: false,
    originIntent: 'defensive',
    currentIntent: 'reengage',
    ordinaryProfit: false,
    directionDwells: [350, 400, 400, 450]
  });
  const defensiveDamageRelease = combatBallisticCloseCore({
    targetId: 'defensive-8',
    previousState: defensiveBallisticClose.state,
    nowMs: 5300,
    distanceCm: 4200,
    noDamageMs: 4300,
    selfNoDamageMs: 100,
    acceptedShotsSinceDamage: 15,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: false,
    recentSelfDamage: true,
    passiveRunnerConfirmed: false,
    originIntent: 'defensive',
    currentIntent: 'reengage',
    ordinaryProfit: false,
    directionDwells: [350, 400, 400, 450]
  });
  const defensivePersistentThreatRelease = combatBallisticCloseCore({
    targetId: 'defensive-8',
    previousState: defensiveBallisticClose.state,
    nowMs: 5400,
    distanceCm: 4200,
    noDamageMs: 4400,
    selfNoDamageMs: 4400,
    acceptedShotsSinceDamage: 16,
    selfHp: 100,
    targetFiring: false,
    targetBulletPressure: false,
    persistentThreat: true,
    recentSelfDamage: false,
    passiveRunnerConfirmed: false,
    originIntent: 'defensive',
    currentIntent: 'reengage',
    ordinaryProfit: false,
    directionDwells: [350, 400, 400, 450]
  });
  results.push({
    name: 'combat-ballistic-close-defensive-origin-escalates-after-threat-clears-and-releases-on-injury',
    passed: defensiveBallisticClose.active === true
      && defensiveBallisticClose.defensiveThreatCleared === true
      && defensiveRelease.active === false
      && defensiveRelease.reason === 'unsafe-self-hp'
      && defensiveBulletRelease.active === false
      && defensiveBulletRelease.reason === 'target-bullet-pressure'
      && defensiveDamageRelease.active === false
      && defensiveDamageRelease.reason === 'recent-self-damage'
      && defensivePersistentThreatRelease.active === false
      && defensivePersistentThreatRelease.reason === 'persistent-target-threat'
  });

  const lootRaceActive = lootRacePositioningCore({
    self: { user_id: 1, x: 0, y: 0, hp: 100 },
    target: { user_id: 2, x: 5000, y: 0, hp: 12, drop: 47, dropKnown: true },
    realtimeTargets: [
      { user_id: 1, x: 0, y: 0, active: true },
      { user_id: 2, x: 5000, y: 0, active: true },
      { user_id: 3, x: 3000, y: 500, active: true }
    ],
    combatTargetState: { firstHp: 100, damageFromStart: 88, lastDamageAmount: 3 },
    combatMetrics: { targetDamage: 88, confirmedHits: 10 },
    aim: { predictedTargetAtCreation: { x: 5000, y: 0 } },
    closePressureActive: true,
    closePressureTooClose: false
  }, {
    combatLootRacePositioningEnabled: true
  });
  const lootRaceNoCompetitor = lootRacePositioningCore({
    self: { user_id: 1, x: 0, y: 0, hp: 100 },
    target: { user_id: 2, x: 5000, y: 0, hp: 12, drop: 47, dropKnown: true },
    realtimeTargets: [
      { user_id: 1, x: 0, y: 0, active: true },
      { user_id: 2, x: 5000, y: 0, active: true },
      { user_id: 3, x: -5000, y: 0, active: true }
    ],
    combatTargetState: { firstHp: 100, damageFromStart: 88 },
    aim: { predictedTargetAtCreation: { x: 5000, y: 0 } },
    closePressureActive: true,
    closePressureTooClose: false
  });
  const lootRaceHighHp = lootRacePositioningCore({
    self: { user_id: 1, x: 0, y: 0, hp: 100 },
    target: { user_id: 2, x: 5000, y: 0, hp: 75, drop: 47, dropKnown: true },
    realtimeTargets: [{ user_id: 3, x: 3000, y: 0, active: true }],
    combatTargetState: { firstHp: 100, damageFromStart: 25 },
    aim: { predictedTargetAtCreation: { x: 5000, y: 0 } },
    closePressureActive: true,
    closePressureTooClose: false
  });
  const lootRaceLowHp = lootRacePositioningCore({
    self: { user_id: 1, x: 0, y: 0, hp: 50 },
    target: { user_id: 2, x: 5000, y: 0, hp: 12, drop: 47, dropKnown: true },
    realtimeTargets: [{ user_id: 3, x: 3000, y: 0, active: true }],
    combatTargetState: { firstHp: 100, damageFromStart: 88 },
    aim: { predictedTargetAtCreation: { x: 5000, y: 0 } },
    closePressureActive: true,
    closePressureTooClose: false
  });
  results.push({
    name: 'loot-race-positioning-uses-realtime-competitor-eta-and-preserves-safety-gates',
    passed: lootRaceActive.active === true
      && lootRaceActive.reason === 'competitor-eta-close'
      && lootRaceActive.direction.dx === 1
      && lootRaceActive.direction.dy === 0
      && lootRaceActive.dropPointSource === 'aim-predicted-target-at-creation'
      && lootRaceActive.targetDrop === 47
      && lootRaceNoCompetitor.active === false
      && lootRaceNoCompetitor.reason === 'competitor-eta-not-close'
      && lootRaceHighHp.active === false
      && lootRaceHighHp.reason === 'kill-horizon-too-long'
      && lootRaceLowHp.active === false
      && lootRaceLowHp.reason === 'self-hp-below-loot-race-threshold'
  });

  const efficiencyThreshold100 = combatDamageEfficiencyThresholdCore(100, {
    profitThresholdCoinsPer10Stamina: 1
  });
  const efficiencyThreshold50 = combatDamageEfficiencyThresholdCore(50, {
    profitThresholdCoinsPer10Stamina: 1
  });
  const efficiencyWindow100 = combatEfficiencyWindowCore(efficiencyThreshold100, {
    combatShootMinIntervalMs: 160,
    combatShotStaminaCostMs: 500
  });
  const efficiencyWindow50 = combatEfficiencyWindowCore(efficiencyThreshold50, {
    combatShootMinIntervalMs: 160,
    combatShotStaminaCostMs: 500
  });
  results.push({
    name: 'combat-efficiency-window-derives-drop-aware-time-for-nine-hp',
    passed: efficiencyWindow100.windowMode === 'expected-9-hp'
      && efficiencyWindow100.referenceDamageHp === 9
      && efficiencyWindow100.expectedHitRate === 0.016667
      && efficiencyWindow100.expectedStaminaForReferenceDamage === 90
      && efficiencyWindow100.evaluationWindowMs === 28800
      && efficiencyWindow50.expectedHitRate === 0.033333
      && efficiencyWindow50.expectedStaminaForReferenceDamage === 45
      && efficiencyWindow50.evaluationWindowMs === 14400
  });
  const measuredEfficiencyOptions = {
    combatControlIntervalMs: 50,
    combatServerTickMs: 50,
    combatBulletSpeedPerTick: 500,
    combatMoveSpeedPerTick: 50,
    combatBulletHitRadiusCm: 90,
    combatFrameJitterMs: 50,
    combatReactionSafetyMarginMs: 100,
    combatClosePressureMinRangeCm: 4500,
    combatClosePressureMaxRangeCm: 5500,
    movementExecutionTiming: { p90Ticks: 5 },
    profitThresholdCoinsPer10Stamina: 1
  };
  const measuredEfficiencyStart = {
    id: 'measured-target',
    combatPhase: 'normal-combat',
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 100,
    combatEfficiency: {
      startedAt: 1000,
      startDamageTotal: 0,
      startStaminaMilli: 0,
      staminaKnown: true
    }
  };
  const measuredEfficiencyLow = combatPressurePhaseCore(measuredEfficiencyStart, {
    targetId: 'measured-target',
    nowMs: 31000,
    engagedAt: 1000,
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 97,
    targetHp: 97,
    damageFromStart: 3,
    damageKnown: true,
    targetDamageTotal: 3,
    totalStaminaSpentMilli: 40000,
    targetDrop: 100,
    distance: 12000
  }, measuredEfficiencyOptions);
  const measuredEfficiencyHigh = combatPressurePhaseCore({
    id: 'measured-target',
    combatPhase: measuredEfficiencyLow.phase,
    phaseStartedAt: measuredEfficiencyLow.phaseStartedAt,
    closePressure: measuredEfficiencyLow,
    combatEfficiency: measuredEfficiencyLow.combatEfficiency
  }, {
    targetId: 'measured-target',
    nowMs: 61000,
    engagedAt: 1000,
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 89,
    targetHp: 89,
    damageFromStart: 11,
    damageKnown: true,
    targetDamageTotal: 11,
    totalStaminaSpentMilli: 80000,
    targetDrop: 100,
    distance: 5000
  }, measuredEfficiencyOptions);
  const measuredEfficiencyExit = combatPressurePhaseCore({
    id: 'measured-target',
    combatPhase: measuredEfficiencyLow.phase,
    phaseStartedAt: measuredEfficiencyLow.phaseStartedAt,
    closePressure: measuredEfficiencyLow,
    combatEfficiency: measuredEfficiencyLow.combatEfficiency
  }, {
    targetId: 'measured-target',
    nowMs: 61000,
    engagedAt: 1000,
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 94,
    targetHp: 94,
    damageFromStart: 6,
    damageKnown: true,
    targetDamageTotal: 6,
    totalStaminaSpentMilli: 80000,
    targetDrop: 100,
    distance: 6000
  }, measuredEfficiencyOptions);
  const measuredEfficiencyDrop50 = combatPressurePhaseCore({
    id: 'drop50-target',
    combatPhase: 'normal-combat',
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 94,
    combatEfficiency: {
      startedAt: 1000,
      startDamageTotal: 0,
      startStaminaMilli: 0,
      staminaKnown: true
    }
  }, {
    targetId: 'drop50-target',
    nowMs: 31000,
    engagedAt: 1000,
    firstSeenAt: 1000,
    firstHp: 100,
    minHp: 94,
    targetHp: 94,
    damageFromStart: 6,
    damageKnown: true,
    targetDamageTotal: 6,
    totalStaminaSpentMilli: 40000,
    targetDrop: 50,
    distance: 12000
  }, measuredEfficiencyOptions);
  results.push({
    name: 'combat-efficiency-uses-total-stamina-and-dynamic-drop-threshold',
    passed: efficiencyThreshold100.requiredHpPerStamina === 0.1
      && efficiencyThreshold100.rewardMultiplier === 1
      && efficiencyThreshold50.requiredHpPerStamina === 0.2
      && efficiencyThreshold50.rewardMultiplier === 0.5
      && measuredEfficiencyLow.active === true
      && measuredEfficiencyLow.attackEfficiency.targetDamageHp === 3
      && measuredEfficiencyLow.attackEfficiency.staminaSpent === 40
      && measuredEfficiencyLow.attackEfficiency.hpPerStamina === 0.075
      && measuredEfficiencyLow.attackEfficiency.requiredHpPerStamina === 0.1
      && measuredEfficiencyLow.attackEfficiency.low === true
      && measuredEfficiencyHigh.active === false
      && measuredEfficiencyHigh.attackEfficiency.acceptable === true
      && measuredEfficiencyExit.active === true
      && measuredEfficiencyExit.attackEfficiency.targetDamageHp === 3
      && measuredEfficiencyExit.attackEfficiency.hpPerStamina === 0.075
      && measuredEfficiencyExit.attackEfficiency.low === true
      && measuredEfficiencyExit.distanceControlFailed === true
      && measuredEfficiencyExit.exitRequired === true
      && measuredEfficiencyExit.exitRule === 'closer-range-control-failed'
      && measuredEfficiencyDrop50.active === true
      && measuredEfficiencyDrop50.attackEfficiency.requiredHpPerStamina === 0.2
      && measuredEfficiencyDrop50.attackEfficiency.low === true
  });

  const pressurePhaseOptions = {
    combatEfficiencyWindowMs: 30000,
    combatControlIntervalMs: 50,
    combatServerTickMs: 50,
    combatBulletSpeedPerTick: 500,
    combatMoveSpeedPerTick: 50,
    combatBulletHitRadiusCm: 90,
    combatFrameJitterMs: 50,
    combatReactionSafetyMarginMs: 100,
    combatClosePressureMinRangeCm: 4500,
    combatClosePressureMaxRangeCm: 5500,
    movementExecutionTiming: { p90Ticks: 5 }
  };
  const pressurePhaseInput = {
    targetId: '8',
    engagedAt: 1000,
    originIntent: 'profit',
    damageFromStart: 0,
    damageKnown: true,
    damageProgressAt: 1000,
    distance: 12000
  };
  const pressureSample1 = combatPressurePhaseCore({
    id: '8', combatPhase: 'normal-combat', firstSeenAt: 1000, firstHp: 100, minHp: 100, damageProgressAt: 1000
  }, { ...pressurePhaseInput, nowMs: 31000, acceptedShotsSinceDamage: 0 }, pressurePhaseOptions);
  const pressureState = phase => ({
    id: '8',
    combatPhase: phase.phase,
    phaseStartedAt: phase.phaseStartedAt,
    closePressure: phase
  });
  let maintainedPressure = pressureSample1;
  for (let at = 31250; at <= 61000; at += 250) {
    maintainedPressure = combatPressurePhaseCore(pressureState(maintainedPressure), {
      ...pressurePhaseInput,
      nowMs: at,
      acceptedShotsSinceDamage: 0,
      distance: at <= 46250 ? 5000 : 6000
    }, pressurePhaseOptions);
  }
  let failedPressure = pressureSample1;
  for (let at = 31250; at <= 61000; at += 250) {
    failedPressure = combatPressurePhaseCore(pressureState(failedPressure), {
      ...pressurePhaseInput,
      nowMs: at,
      acceptedShotsSinceDamage: 0,
      distance: 6000
    }, pressurePhaseOptions);
  }
  const pressureDamageReset = combatPressurePhaseCore(pressureState(failedPressure), {
    ...pressurePhaseInput,
    nowMs: 61100,
    acceptedShotsSinceDamage: 0,
    damageProgressAt: 61100,
    damageFromStart: 3,
    distance: 6000
  }, pressurePhaseOptions);
  results.push({
    name: 'combat-efficiency-window-advances-at-half-close-time-and-exits-when-distance-control-fails',
    passed: pressureSample1.subphase === 'closing'
      && pressureSample1.goalDistanceCm === 5000
      && maintainedPressure.stepAdvanced === true
      && maintainedPressure.stepIndex === 2
      && maintainedPressure.goalDistanceCm === 4000
      && maintainedPressure.exitRequired === false
      && maintainedPressure.lastCompletedWindow.closerRatio >= 0.5
      && failedPressure.stepElapsedMs === 30000
      && failedPressure.closerRatio < 0.5
      && failedPressure.distanceControlFailed === true
      && failedPressure.exitRequired === true
      && failedPressure.exitRule === 'closer-range-control-failed'
      && pressureDamageReset.phase === 'normal-combat'
      && pressureDamageReset.active === false
  });

  const defensivePressure = combatPressurePhaseCore({
    id: 'defensive-target', combatPhase: 'normal-combat', firstSeenAt: 1000, damageProgressAt: 1000
  }, {
    targetId: 'defensive-target', nowMs: 31000, engagedAt: 1000, ordinaryProfit: false,
    damageKnown: true, damageFromStart: 0, damageProgressAt: 1000,
    acceptedShotsSinceDamage: 0, distance: 1800
  }, pressurePhaseOptions);
  let minimumRangePressure = combatPressurePhaseCore({
    id: 'minimum-target', combatPhase: 'normal-combat', firstSeenAt: 1000, damageProgressAt: 1000
  }, {
    targetId: 'minimum-target', nowMs: 31000, engagedAt: 1000, ordinaryProfit: true,
    damageKnown: true, damageFromStart: 0, damageProgressAt: 1000,
    acceptedShotsSinceDamage: 0, distance: 1800
  }, pressurePhaseOptions);
  const minimumState = phase => ({
    id: 'minimum-target', combatPhase: phase.phase, phaseStartedAt: phase.phaseStartedAt, closePressure: phase
  });
  for (let at = 31250; at <= 61000; at += 250) {
    minimumRangePressure = combatPressurePhaseCore(minimumState(minimumRangePressure), {
      targetId: 'minimum-target', nowMs: at, engagedAt: 1000, ordinaryProfit: true,
      damageKnown: true, damageFromStart: 0, damageProgressAt: 1000,
      acceptedShotsSinceDamage: 0, distance: 1000
    }, pressurePhaseOptions);
  }
  results.push({
    name: 'combat-efficiency-close-applies-to-defensive-combat-and-exits-after-minimum-range-no-progress',
    passed: defensivePressure.active === true
      && defensivePressure.ordinaryProfit === false
      && defensivePressure.goalDistanceCm === 1000
      && minimumRangePressure.minimumRangeNoProgress === true
      && minimumRangePressure.exitRequired === true
      && minimumRangePressure.exitRule === 'minimum-range-no-progress'
      && minimumRangePressure.closerRatio >= 0.5
  });

  const shadowInitial = updateCombatResponsePolicyShadowCore(null, {
    targetId: 'generic-target', nowMs: 0, candidatePolicy: 'policy-a'
  });
  let shadowConfirmed = shadowInitial;
  for (let tick = 1; tick <= 6; tick += 1) {
    shadowConfirmed = updateCombatResponsePolicyShadowCore(shadowConfirmed, {
      targetId: 'generic-target', nowMs: tick * 100, candidatePolicy: 'policy-b'
    });
  }
  const shadowReversalCandidate = updateCombatResponsePolicyShadowCore(shadowInitial, {
    targetId: 'generic-target', nowMs: 100, candidatePolicy: 'policy-b'
  });
  const shadowReversal = updateCombatResponsePolicyShadowCore(shadowReversalCandidate, {
    targetId: 'generic-target', nowMs: 200, candidatePolicy: 'policy-a'
  });
  const shadowUnavailable = updateCombatResponsePolicyShadowCore(shadowInitial, {
    targetId: 'generic-target', nowMs: 250, candidatePolicy: ''
  });
  let shadowMinimumHold = updateCombatResponsePolicyShadowCore(null, {
    targetId: 'hold-target', nowMs: 0, candidatePolicy: 'policy-a'
  }, { confirmTicks: 3, minimumHoldMs: 300 });
  for (const nowMs of [50, 100, 150]) {
    shadowMinimumHold = updateCombatResponsePolicyShadowCore(shadowMinimumHold, {
      targetId: 'hold-target', nowMs, candidatePolicy: 'policy-b'
    }, { confirmTicks: 3, minimumHoldMs: 300 });
  }
  const shadowMinimumHoldCommit = updateCombatResponsePolicyShadowCore(shadowMinimumHold, {
    targetId: 'hold-target', nowMs: 300, candidatePolicy: 'policy-b'
  }, { confirmTicks: 3, minimumHoldMs: 300 });
  const shadowTargetSwitch = updateCombatResponsePolicyShadowCore(shadowInitial, {
    targetId: 'other-target', nowMs: 50, candidatePolicy: 'policy-c'
  });
  const shadowBypasses = ['real-incoming-bullet', 'dodge-unsafe', 'hp-or-exit'].map(bypassReason => (
    updateCombatResponsePolicyShadowCore(shadowInitial, {
      targetId: 'generic-target', nowMs: 50, candidatePolicy: 'policy-b', bypassReason
    })
  ));
  results.push({
    name: 'combat-response-policy-shadow-confirms-candidates-and-never-delays-safety-bypasses',
    passed: shadowInitial.committedPolicy === 'policy-a'
      && shadowConfirmed.committedPolicy === 'policy-b'
      && shadowConfirmed.switched === true
      && shadowReversal.committedPolicy === 'policy-a'
      && shadowReversal.candidatePolicy === ''
      && shadowUnavailable.committedPolicy === 'policy-a'
      && shadowUnavailable.transitionReason === 'policy-unavailable-preserve-commitment'
      && shadowMinimumHold.committedPolicy === 'policy-a'
      && shadowMinimumHold.transitionReason === 'minimum-hold-pending'
      && shadowMinimumHoldCommit.committedPolicy === 'policy-b'
      && shadowTargetSwitch.committedPolicy === 'policy-c'
      && shadowTargetSwitch.transitionReason === 'target-changed'
      && shadowBypasses.every(item => item.bypassed
        && item.committedPolicy === 'policy-a'
        && item.effectivePolicy === 'policy-b'
        && !item.switched)
  });

  const movementThreatField = [
    { dx: 1, dy: 0, directHits: 0, minCPA: 250 },
    { dx: 0, dy: 1, directHits: 0, minCPA: 300 },
    { dx: -1, dy: 0, directHits: 0, minCPA: 500 }
  ];
  const strategicMove = selectCombatMovementArbitrationCore({
    threatField: movementThreatField,
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    emergencyDirection: { dx: -1, dy: 0 }
  }, { minimumCpaCm: 200 });
  const heldMove = selectCombatMovementArbitrationCore({
    threatField: movementThreatField.map(item => item.dx === 1 ? { ...item, directHits: 1, minCPA: 50 } : item),
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    emergencyDirection: { dx: -1, dy: 0 }
  }, { minimumCpaCm: 200 });
  const pendingMove = selectCombatMovementArbitrationCore({
    threatField: movementThreatField,
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    pendingDirection: { dx: 0, dy: 1 },
    pendingActive: true,
    emergencyDirection: { dx: -1, dy: 0 }
  }, { minimumCpaCm: 200 });
  const emergencyMove = selectCombatMovementArbitrationCore({
    threatField: movementThreatField.map(item => ({ ...item, directHits: 1, minCPA: 50 })),
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: 0, dy: 1 },
    emergencyDirection: { dx: -1, dy: 0 }
  }, { minimumCpaCm: 200 });
  results.push({
    name: 'combat-movement-prefers-safe-strategy-over-stale-pending-hold-and-only-uses-emergency-dodge-for-real-risk',
    passed: strategicMove.source === 'strategic-safe'
      && strategicMove.dx === 1 && strategicMove.dy === 0
      && heldMove.source === 'current-safe-hold'
      && heldMove.dx === 0 && heldMove.dy === 1
      && pendingMove.source === 'strategic-safe'
      && pendingMove.dx === 1 && pendingMove.dy === 0
      && emergencyMove.source === 'emergency-dodge'
      && emergencyMove.dx === -1 && emergencyMove.dy === 0
  });

  const competitionSafeProgressMove = selectCombatMovementArbitrationCore({
    threatField: [
      { dx: 1, dy: 0, directHits: 1, unavoidableHits: 0, minCPA: 50 },
      { dx: 1, dy: 1, directHits: 0, unavoidableHits: 0, minCPA: 350 },
      { dx: 0, dy: 1, directHits: 0, unavoidableHits: 0, minCPA: 450 },
      { dx: -1, dy: 0, directHits: 0, unavoidableHits: 0, minCPA: 500 }
    ],
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: -1, dy: 0 },
    emergencyDirection: { dx: 0, dy: 1 },
    preferStrategicProgress: true
  }, { minimumCpaCm: 200 });
  const competitionNoSafeProgressMove = selectCombatMovementArbitrationCore({
    threatField: [
      { dx: 1, dy: 0, directHits: 1, unavoidableHits: 0, minCPA: 50 },
      { dx: 1, dy: 1, directHits: 1, unavoidableHits: 0, minCPA: 60 },
      { dx: 1, dy: -1, directHits: 0, unavoidableHits: 1, minCPA: 60 },
      { dx: 0, dy: 1, directHits: 0, unavoidableHits: 0, minCPA: 450 },
      { dx: -1, dy: 0, directHits: 0, unavoidableHits: 0, minCPA: 500 }
    ],
    strategicDirection: { dx: 1, dy: 0 },
    currentDirection: { dx: -1, dy: 0 },
    emergencyDirection: { dx: 0, dy: 1 },
    preferStrategicProgress: true
  }, { minimumCpaCm: 200 });
  results.push({
    name: 'profit-competition-movement-selects-safe-positive-progress-before-retreat',
    passed: competitionSafeProgressMove.source === 'strategic-safe-progress'
      && competitionSafeProgressMove.dx === 1
      && competitionSafeProgressMove.dy === 1
      && competitionSafeProgressMove.strategicProgress > 0
      && competitionSafeProgressMove.safeProgressCandidateCount === 1
      && competitionSafeProgressMove.competitionApproachPreemptedBy === ''
      && competitionNoSafeProgressMove.source === 'current-safe-hold'
      && competitionNoSafeProgressMove.dx === -1
      && competitionNoSafeProgressMove.safeProgressCandidateCount === 0
      && competitionNoSafeProgressMove.competitionApproachPreemptedBy === 'current-safe-no-forward-option'
  });

  const escortForward = selectProfitEscortDirectionCore({
    active: true,
    self: { x: 0, y: 0 },
    missionTarget: { x: 90000, y: 0, authority: 'snapshot-navigation' },
    combatTarget: { x: 8000, y: 0 }
  }, {
    localDetourRadiusCm: 10000,
    detourCorridorCm: 4500
  });
  const escortSidePressure = selectProfitEscortDirectionCore({
    active: true,
    self: { x: 0, y: 0 },
    missionTarget: { x: 90000, y: 0 },
    combatTarget: { x: 3000, y: 7000 }
  }, {
    localDetourRadiusCm: 10000,
    detourCorridorCm: 4500
  });
  const escortBlockedByBullet = selectCombatMovementArbitrationCore({
    threatField: [
      { dx: 1, dy: -1, directHits: 1, minCPA: 40 },
      { dx: 0, dy: 1, directHits: 1, minCPA: 40 }
    ],
    strategicDirection: escortForward.direction,
    currentDirection: { dx: 0, dy: 1 },
    emergencyDirection: { dx: 0, dy: 1 }
  }, { minimumCpaCm: 200 });
  results.push({
    name: 'profit-escort-keeps-forward-progress-and-yields-to-realtime-dodge',
    passed: escortForward.active === true
      && escortForward.detour === true
      && escortForward.missionProgress > 0
      && escortSidePressure.active === true
      && escortSidePressure.missionProgress > 0
      && escortBlockedByBullet.source === 'emergency-dodge'
      && escortBlockedByBullet.dx === 0
      && escortBlockedByBullet.dy === 1
  });

  const escortMission = {
    active: true,
    key: 'enemy:42',
    missionKey: 'enemy:42',
    type: 'enemy',
    targetId: '42',
    navigationTarget: { userId: 42, x: 90000, y: 0 },
    expiresAt: 5000
  };
  const enteredEscortContinuity = updateProfitEscortContinuityCore(null, {
    nowMs: 1000,
    mission: escortMission,
    combatTargetId: '8',
    engagementGeneration: 'engagement:1',
    controlGeneration: 'control:1',
    combatTargetVisible: true,
    entryEligible: true,
    entryEvidence: { targetFiring: true },
    missionProgress: { netProgressCm: 0 }
  }, { maximumMs: 3000 });
  const maintainedEscortContinuity = updateProfitEscortContinuityCore(enteredEscortContinuity.state, {
    nowMs: 1200,
    mission: escortMission,
    combatTargetId: '8',
    engagementGeneration: 'engagement:1',
    controlGeneration: 'control:1',
    combatTargetVisible: true,
    entryEligible: false,
    missionProgress: { netProgressCm: 250 }
  }, { maximumMs: 3000 });
  results.push({
    name: 'profit-escort-continuity-enters-on-evidence-and-maintains-the-same-bounded-engagement',
    passed: enteredEscortContinuity.entered === true
      && enteredEscortContinuity.state?.missionKey === 'enemy:42'
      && enteredEscortContinuity.state?.combatTargetId === '8'
      && enteredEscortContinuity.state?.engagementGeneration === 'engagement:1'
      && enteredEscortContinuity.state?.expiresAt === 4000
      && maintainedEscortContinuity.entered === false
      && maintainedEscortContinuity.maintained === true
      && maintainedEscortContinuity.state?.enteredAt === 1000
      && maintainedEscortContinuity.state?.entryEvidence?.targetFiring === true
      && maintainedEscortContinuity.state?.missionProgress?.netProgressCm === 250
      && profitEscortContinuityMatchesCore(maintainedEscortContinuity.state, {
        nowMs: 1200,
        mission: escortMission,
        combatTargetId: '8',
        engagementGeneration: 'engagement:1',
        controlGeneration: 'control:1'
      })
      && !profitEscortContinuityMatchesCore(maintainedEscortContinuity.state, {
        nowMs: 1200,
        mission: escortMission,
        combatTargetId: '8',
        engagementGeneration: 'engagement:2',
        controlGeneration: 'control:1'
      })
  });

  const reboundEscortContinuity = updateProfitEscortContinuityCore(maintainedEscortContinuity.state, {
    nowMs: 1300,
    mission: {
      ...escortMission,
      key: 'enemy:77',
      missionKey: 'enemy:77',
      targetId: '77',
      navigationTarget: { userId: 77, x: 70000, y: 0 }
    },
    combatTargetId: '8',
    engagementGeneration: 'engagement:1',
    controlGeneration: 'control:1',
    combatTargetVisible: true,
    entryEligible: true,
    entryReason: 'same-engagement-mission-rebind'
  }, { maximumMs: 3000 });
  results.push({
    name: 'profit-escort-continuity-rebinds-a-regularly-selected-mission-without-changing-engagement',
    passed: reboundEscortContinuity.release?.releaseReason === 'profit-mission-replaced'
      && reboundEscortContinuity.entered === true
      && reboundEscortContinuity.state?.missionKey === 'enemy:77'
      && reboundEscortContinuity.state?.missionTargetId === '77'
      && reboundEscortContinuity.state?.combatTargetId === '8'
      && reboundEscortContinuity.state?.engagementGeneration === 'engagement:1'
      && reboundEscortContinuity.state?.entryReason === 'same-engagement-mission-rebind'
  });

  const escortReleaseCases = [
    {
      name: 'engagement-generation',
      input: { engagementGeneration: 'engagement:2' },
      reason: 'combat-engagement-generation-changed'
    },
    {
      name: 'control-generation',
      input: { controlGeneration: 'control:2' },
      reason: 'combat-control-generation-changed'
    },
    {
      name: 'mission-expiry',
      nowMs: 5000,
      reason: 'profit-mission-expired'
    },
    {
      name: 'realtime-stale',
      input: { releaseReason: 'realtime-state-stale' },
      reason: 'realtime-state-stale'
    }
  ];
  const escortReleaseResults = escortReleaseCases.map(testCase => updateProfitEscortContinuityCore(
    maintainedEscortContinuity.state,
    {
      nowMs: testCase.nowMs ?? 1400,
      mission: escortMission,
      combatTargetId: '8',
      engagementGeneration: 'engagement:1',
      controlGeneration: 'control:1',
      combatTargetVisible: true,
      entryEligible: false,
      ...testCase.input
    },
    { maximumMs: 3000 }
  ));
  const missingGenerationEntry = updateProfitEscortContinuityCore(null, {
    nowMs: 1000,
    mission: escortMission,
    combatTargetId: '8',
    entryEligible: true
  });
  const sameTargetEntry = updateProfitEscortContinuityCore(null, {
    nowMs: 1000,
    mission: escortMission,
    combatTargetId: '42',
    engagementGeneration: 'engagement:1',
    entryEligible: true
  });
  results.push({
    name: 'profit-escort-continuity-releases-on-expiry-generation-and-stale-boundaries',
    passed: escortReleaseResults.every((result, index) => (
      result.state === null
        && result.release?.releaseReason === escortReleaseCases[index].reason
    ))
      && missingGenerationEntry.state === null
      && sameTargetEntry.state === null
  });

  const pressureAttackPaused = determineCombatFireState(
    { stamina_5s_remaining_milli: 3099 },
    { user_id: 8 },
    { closePressure: true, closePressureAttack: true, closePressureReserveMs: 2600, shotCostMs: 500 }
  );
  const pressureAttackReady = determineCombatFireState(
    { stamina_5s_remaining_milli: 3100 },
    { user_id: 8 },
    { closePressure: true, closePressureAttack: true, closePressureReserveMs: 2600, shotCostMs: 500 }
  );
  const pressureAttackBudget = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 10,
    fireGate: { active: true, suppressFire: true, reason: 'high-entropy-reacquire', explorationMaxShots: 15 },
    probeState: { suppressFire: true },
    closePressure: true,
    pressureAttack: true
  });
  const invalidPressureAttackBudget = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 100,
    fireGate: { active: true, suppressFire: true, reason: 'high-entropy-reacquire', explorationMaxShots: 15 },
    probeState: { suppressFire: true },
    closePressure: true,
    pressureAttack: true
  });
  const boundedPressureAttackBudget = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 100,
    fireGate: { active: true, suppressFire: true, reason: 'high-entropy-reacquire', explorationMaxShots: 15 },
    probeState: { suppressFire: true, highEntropy: true },
    closePressure: true,
    pressureAttack: true,
    boundedPressureVolley: true
  });
  results.push({
    name: 'combat-pressure-attack-bypasses-probe-budget-only-above-post-shot-movement-reserve',
    passed: pressureAttackPaused.state === 'paused'
      && pressureAttackPaused.reason === 'close-pressure-movement-reserve'
      && pressureAttackReady.state === 'pressure'
      && pressureAttackReady.cadenceMs === COMBAT_CONSTANTS.SHOOT_EVERY_MS
      && pressureAttackBudget.suppressFire === false
      && pressureAttackBudget.authorizationSource === 'close-pressure-full-attack'
      && invalidPressureAttackBudget.suppressFire === false
      && invalidPressureAttackBudget.authorizationSource === 'close-pressure-full-attack'
      && boundedPressureAttackBudget.suppressFire === true
      && boundedPressureAttackBudget.boundedPressureVolley === true
      && boundedPressureAttackBudget.suppressionReason === 'budget-state-invalid'
  });

  // A target that is shooting at us resolves the lower pressure reserve, so the
  // same stamina that authorizes defensive fire authorizes fire at a profit
  // primary under fire too. Before this, the primary's fire state asserted no
  // pressure and carried the ordinary dodge reserve, leaving a stamina band
  // (4100-5300ms at a 1000ms dodge cost) where only the secondary could fire —
  // the 2026-09-01 00:06 fight sat in that band for 76 of 162 frames. The hard
  // reserve floor is unchanged and still refuses fire on its own.
  const pressureReserveContext = {
    hardReserveMs: 1800,
    dodgeReserveMs: 3800,
    pressureReserveMs: 2600,
    shotCostMs: 500,
    dodgeActionCostMs: 1000
  };
  const primaryUnderFireReady = determineCombatFireState(
    { stamina_5s_remaining_milli: 4100 },
    { user_id: 8 },
    { ...pressureReserveContext, targetPressureFire: true }
  );
  const primaryWithoutPressurePaused = determineCombatFireState(
    { stamina_5s_remaining_milli: 4100 },
    { user_id: 8 },
    { ...pressureReserveContext, targetPressureFire: false }
  );
  const primaryUnderFireBelowPressureReserve = determineCombatFireState(
    { stamina_5s_remaining_milli: 4099 },
    { user_id: 8 },
    { ...pressureReserveContext, targetPressureFire: true }
  );
  const primaryUnderFireBelowHardReserve = determineCombatFireState(
    { stamina_5s_remaining_milli: 1799 },
    { user_id: 8 },
    { ...pressureReserveContext, targetPressureFire: true }
  );
  // Without pressure the ordinary dodge reserve still governs, so a target that
  // is not shooting at us gains nothing from this change.
  const quietTargetOrdinaryReserve = determineCombatFireState(
    { stamina_5s_remaining_milli: 5300 },
    { user_id: 8 },
    { ...pressureReserveContext, targetPressureFire: false }
  );
  results.push({
    name: 'target-under-fire-resolves-pressure-reserve-while-hard-reserve-stays-absolute',
    passed: primaryUnderFireReady.state === 'pressure'
      && primaryUnderFireReady.reason === 'target-pressure-fire'
      && primaryUnderFireReady.reserve === 2600
      && primaryUnderFireReady.requiredStaminaMs === 4100
      && primaryWithoutPressurePaused.state === 'paused'
      && primaryWithoutPressurePaused.reason === 'dodge-reserve'
      && primaryWithoutPressurePaused.reserve === 3800
      && primaryWithoutPressurePaused.requiredStaminaMs === 5300
      && primaryUnderFireBelowPressureReserve.state === 'paused'
      && primaryUnderFireBelowPressureReserve.reason === 'pressure-dodge-reserve'
      && primaryUnderFireBelowHardReserve.state === 'disabled'
      && primaryUnderFireBelowHardReserve.reason === 'below-hard-reserve'
      && quietTargetOrdinaryReserve.state !== 'paused'
      && quietTargetOrdinaryReserve.reserve === 3800
  });
  const economicObserve = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs: 59000,
    targetId: '8',
    damageProgressAt: 0,
    acceptedShotsSinceDamage: 20,
    movementStaminaSinceDamage: 90000,
    stableCloseMs: 10000,
    marginalNetROI: 2,
    requiredRoi: 1
  });
  const economicPressure = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs: 60000,
    targetId: '8',
    damageProgressAt: 0,
    acceptedShotsSinceDamage: 20,
    movementStaminaSinceDamage: 100000,
    stableCloseMs: 10000,
    marginalNetROI: 2,
    requiredRoi: 1
  }, economicObserve.state);
  const economicCycleRelease = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs: 120000,
    targetId: '8',
    damageProgressAt: 0,
    acceptedShotsSinceDamage: 20,
    movementStaminaSinceDamage: 200000,
    stableCloseMs: 10000,
    marginalNetROI: 2,
    requiredRoi: 1
  }, economicPressure.state);
  const economicLowRoiRelease = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs: 60000,
    targetId: '9',
    damageProgressAt: 0,
    acceptedShotsSinceDamage: 30,
    movementStaminaSinceDamage: 100000,
    marginalNetROI: 0.9,
    requiredRoi: 1
  });
  const economicHardRelease = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs: 180000,
    targetId: '10',
    damageProgressAt: 0,
    acceptedShotsSinceDamage: 50,
    movementStaminaSinceDamage: 300000,
    marginalNetROI: 50,
    requiredRoi: 1
  });
  const economicThreatExcluded = evaluateNonThreatCombatEconomicStopLossCore({
    nowMs: 180000,
    targetId: '11',
    damageProgressAt: 0,
    movementStaminaSinceDamage: 300000,
    marginalNetROI: 0,
    requiredRoi: 1,
    threatEvidence: true
  });
  const cooldownHeld = evaluateEconomicCooldownReentryCore({
    baselineDrop: 40,
    baselineDistanceCm: 6000
  }, { drop: 49, distance: 4500 });
  const cooldownDropRelease = evaluateEconomicCooldownReentryCore({
    baselineDrop: 40,
    baselineDistanceCm: 6000
  }, { drop: 50, distance: 6000 });
  const cooldownThreatRelease = evaluateEconomicCooldownReentryCore({
    baselineDrop: 40,
    baselineDistanceCm: 6000
  }, { drop: 40, distance: 6000, firing: true });
  results.push({
    name: 'combat-economic-stop-loss-allows-one-bounded-pressure-cycle-and-preserves-threat-combat',
    passed: economicObserve.release === false
      && economicObserve.softTriggered === false
      && economicPressure.continuePressureCycle === true
      && economicPressure.reason === 'non-threat-economic-pressure-cycle-start'
      && economicCycleRelease.release === true
      && economicCycleRelease.reason === 'non-threat-economic-pressure-cycle-complete'
      && economicLowRoiRelease.release === true
      && economicLowRoiRelease.reason === 'non-threat-economic-low-roi'
      && economicHardRelease.release === true
      && economicHardRelease.hardTriggered === true
      && economicThreatExcluded.release === false
      && economicThreatExcluded.excluded === true
      && cooldownHeld.allowed === false
      && cooldownDropRelease.reason === 'target-drop-increased'
      && cooldownThreatRelease.reason === 'target-became-threat'
  });
  const reserveCoverage = { active: true, selected: { marginalCoverage: 0.03 } };
  let closeBandReserve = null;
  for (let index = 0; index < 3; index += 1) {
    closeBandReserve = updateCloseBandReserveCore(closeBandReserve, {
      targetId: '8',
      acceptedShots: 15,
      distance: 5000,
      coverageQualified: true,
      nowMs: 1000 + index * 50
    });
  }
  const reserveAuthorized = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 15,
    fireGate: { active: true, suppressFire: true, explorationMaxShots: 15 },
    probeState: { suppressFire: true },
    trajectoryCoverage: reserveCoverage,
    closeBandReserve
  });
  closeBandReserve.lastAuthorization = reserveAuthorized.authorizationSource;
  const reserveAfterAck = updateCloseBandReserveCore(closeBandReserve, {
    targetId: '8', acceptedShots: 16, distance: 5000, coverageQualified: true, nowMs: 1200
  });
  const noCoverageReserve = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 15,
    fireGate: { active: true, suppressFire: true, explorationMaxShots: 15 },
    probeState: { suppressFire: true },
    trajectoryCoverage: { active: false, selected: { marginalCoverage: 0.01 } },
    closeBandReserve: { ...closeBandReserve, coverageQualified: false, eligible: false }
  });
  const offBandNoCoverage = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 15,
    fireGate: { active: true, suppressFire: true, explorationMaxShots: 15 },
    probeState: { suppressFire: true },
    trajectoryCoverage: { active: false, selected: { marginalCoverage: 0.01 } },
    closeBandReserve: { ...closeBandReserve, inBand: false, stableBandEligible: false, bandTicks: 0, coverageQualified: false, eligible: false }
  });
  let disabledCloseBand = null;
  for (let index = 0; index < 3; index += 1) {
    disabledCloseBand = updateCloseBandReserveCore(disabledCloseBand, {
      targetId: '8', acceptedShots: 15, distance: 5000, coverageQualified: false, nowMs: 1300 + index * 50
    }, { reservedShots: 0, enabled: false });
  }
  const disabledCloseRange = evaluateCombatFireBudgetCore({
    targetId: '8',
    acceptedShotsSinceDamage: 15,
    fireGate: { active: true, suppressFire: true, explorationMaxShots: 15 },
    probeState: { suppressFire: true },
    closeBandReserve: disabledCloseBand
  });
  results.push({
    name: 'combat-stable-close-range-bypasses-fire-gates-while-off-band-combat-remains-bounded',
    passed: reserveAuthorized.authorizationSource === 'close-range-fire-override'
      && reserveAuthorized.reservedCloseBandShotsRemaining === 2
      && reserveAuthorized.ordinaryBudgetRemaining === 0
      && reserveAuthorized.closeRangeFireOverride === true
      && reserveAfterAck.consumedShots === 0
      && reserveAfterAck.remainingShots === 2
      && noCoverageReserve.suppressFire === false
      && noCoverageReserve.authorizationSource === 'close-range-fire-override'
      && offBandNoCoverage.suppressFire === true
      && offBandNoCoverage.authorizationSource === ''
      && disabledCloseBand.stableBandEligible === false
      && disabledCloseRange.suppressFire === true
  });

  const closePressureExchange = evaluateCombatExchangeStopLossCore({
    nowMs: 61000,
    engagedMs: 60000,
    acceptedShots: 40,
    damageObservations: 5,
    selfHp: 88,
    targetHp: 100,
    windowMs: 10000,
    windowSelfDamage: 12,
    windowTargetDamage: 0,
    longWindowSelfDamage: 12,
    longWindowTargetDamage: 0,
    cumulativeSelfDamage: 12,
    cumulativeTargetDamage: 0,
    recentTargetDamage: 0,
    distance: 9000,
    recentThreatBulletCount: 2,
    defensive: true,
    closePressure: true
  });
  const closePressureFireGate = evaluateHighEntropyFireGateCore({
    expectedHitProbability: 0.01,
    recentHitRate: 0,
    recentShotCount: 40,
    noProgressAcceptedShots: 40,
    noDamageMs: 60000,
    selfHp: 88,
    targetHp: 100,
    highEntropy: true,
    closePressure: true
  });
  const closePressureProbe = updateCombatProbePhaseCore({
    targetId: '8',
    probePhase: 'cooldown',
    probeBudgetRemaining: 0,
    baseAcceptedShots: 0,
    baseConfirmedHits: 0,
    baseShootingStamina: 0,
    lastTotalAcceptedShots: 40,
    lastTotalConfirmedHits: 0,
    lastTotalShootingStamina: 20000,
    lastResetAt: 1000,
    phaseStartedAt: 1000
  }, {
    nowMs: 61000,
    targetId: '8',
    acceptedShots: 40,
    confirmedHits: 0,
    shootingStamina: 20000,
    highEntropy: true,
    predictedHitProbability: 0.01,
    closePressure: true
  });
  results.push({
    name: 'combat-close-pressure-keeps-movement-but-respects-shared-fire-cooldown',
    passed: closePressureExchange.phase === 'close-pressure'
      && closePressureExchange.closePressureContinuation === true
      && closePressureExchange.disengage === false
      && closePressureExchange.shouldExit === false
      && closePressureFireGate.suppressFire === true
      && closePressureFireGate.reason === 'high-entropy-reacquire'
      && closePressureProbe.probePhase === 'cooldown'
      && closePressureProbe.suppressFire === true
      && closePressureProbe.suppressionReason === 'probe-zero-damage-budget-cooldown'
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

  const expiredCombatSafetyState = {
    lastAction: { ...combatAction, band: 'combat' },
    lastFocus: buildActionFocus({ ...combatAction, band: 'combat' }),
    lastSelectedAt: Date.now() - 1801,
    lastOverride: null,
    history: []
  };
  const expiredCombatSafety = applyFinalActionArbitration(
    nonUrgentSafety,
    expiredCombatSafetyState.lastAction,
    expiredCombatSafetyState,
    { finalActionArbitrationHoldMs: 1800 }
  );
  results.push({
    name: 'arbitration-nonurgent-safety-preempts-combat-after-hold-window',
    passed: !expiredCombatSafety.held && expiredCombatSafety.action.band === 'safety'
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

  const roiFixtures = [
    { previousId: '4117', previousRoi: 0.00014949101170801116, currentId: '4118', currentRoi: 0.00015877127897580306 },
    { previousId: '4049', previousRoi: 0.00015278662848772437, currentId: '4017', currentRoi: 0.00016386276240056352 },
    { previousId: '7175', previousRoi: 0.00012489330960895634, currentId: '7166', currentRoi: 0.00014179160416276859 },
    { previousId: '7004', previousRoi: 0.00027304497994291843, currentId: '6900', currentRoi: 0.00029470426153367207 }
  ];
  const roiFixtureResults = roiFixtures.map(fixture => {
    const previous = {
      kind: 'coin',
      band: 'profit',
      reason: 'best-opportunity-coin-route',
      target: { id: fixture.previousId },
      finalCandidate: { priorityBand: 'profit', hardGate: false, commitmentRank: 0, switchCost: 0, netROI: fixture.previousRoi }
    };
    const current = {
      kind: 'coin',
      band: 'profit',
      reason: 'best-opportunity-coin',
      target: { id: fixture.currentId },
      finalCandidate: { priorityBand: 'profit', hardGate: false, commitmentRank: 0, switchCost: 0, netROI: fixture.currentRoi }
    };
    const fixtureState = {
      lastAction: previous,
      lastFocus: buildActionFocus(previous),
      lastSelectedAt: Date.now() - 100,
      lastOverride: null,
      history: []
    };
    const selected = applyFinalActionArbitration(current, previous, fixtureState, {
      finalActionArbitrationHoldMs: 1800,
      profitSwitchRoiRatio: 1
    });
    return !selected.held
      && selected.action.target.id === fixture.currentId
      && selected.action.finalCandidate.commitmentRank === 0
      && selected.action.finalCandidate.hardGate === false
      && selected.action.finalCandidate.switchCost === 0;
  });
  results.push({
    name: 'arbitration-zero-cost-profit-roi-regression-fixtures-switch-immediately',
    passed: roiFixtureResults.every(Boolean)
  });

  const dropoutProfit = {
    kind: 'seek-enemy',
    band: 'profit',
    reason: 'easy-kill-active-profit',
    target: { userId: 31361, name: 'generic-target', hp: 94, alive: true, invulnerable: false },
    profitThresholdEligible: true
  };
  const dropoutAction = kind => ({
    kind: 'wait',
    band: 'wait',
    reason: kind,
    stopMotion: true,
    profitDropout: {
      kind,
      yieldable: true,
      targetValid: true,
      targetValidity: 'player-visible',
      targetKey: '31361'
    }
  });
  const dropoutState = {
    lastAction: dropoutProfit,
    lastFocus: buildActionFocus(dropoutProfit, { nowMs: 1000 }),
    lastSelectedAt: 1000,
    lastOverride: null,
    history: []
  };
  const firstDropout = applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    dropoutState,
    { nowMs: 1100, holdMs: 1800 }
  );
  const repeatedDropout = applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    dropoutState,
    { nowMs: 2000, holdMs: 1800 }
  );
  const boundaryDropout = applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    dropoutState,
    { nowMs: 2900, holdMs: 1800 }
  );
  const stableDropout = applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    dropoutState,
    { nowMs: 2901, holdMs: 1800 }
  );
  results.push({
    name: 'arbitration-profit-dropout-requires-stable-confirmation-before-stop',
    passed: firstDropout.held
      && firstDropout.action.reason === 'easy-kill-active-profit'
      && firstDropout.override.dropoutKind === 'no-profitable-candidate'
      && firstDropout.override.dropoutAgeMs === 0
      && repeatedDropout.held
      && repeatedDropout.override.dropoutAgeMs === 900
      && boundaryDropout.held
      && boundaryDropout.override.dropoutAgeMs === 1800
      && boundaryDropout.override.holdRemainingMs === 0
      && !stableDropout.held
      && stableDropout.override === null
      && stableDropout.diagnostic?.mode === 'commit-current'
      && stableDropout.action.reason === 'no-profitable-candidate'
      && stableDropout.action.finalActionArbitration?.mode === 'commit-current'
      && stableDropout.action.finalActionArbitration?.reason === 'profit-dropout-confirmed'
      && stableDropout.action.finalActionArbitration?.dropoutAgeMs === 1801
      && stableDropout.action.finalActionArbitration?.targetValidity === 'player-visible'
      && dropoutState.lastOverride?.mode === 'commit-current'
      && dropoutState.history.at(-1)?.reason === 'profit-dropout-confirmed'
      && dropoutState.profitDropout === null
  });

  const staleCombat = {
    kind: 'combat-live',
    band: 'combat',
    reason: 'combat-live-realtime',
    target: { userId: 34711, name: 'generic-target' }
  };
  const staleCombatState = {
    lastAction: staleCombat,
    lastFocus: buildActionFocus(staleCombat, { nowMs: 1000 }),
    lastSelectedAt: 1000,
    lastOverride: null,
    history: []
  };
  const expiredCombatDropout = applyFinalActionArbitrationCore(
    dropoutAction('dynamic-profit-threshold-wait'),
    staleCombatState,
    { nowMs: 3001, holdMs: 1800 }
  );
  results.push({
    name: 'arbitration-profit-dropout-does-not-reset-expired-combat-hold-age',
    passed: !expiredCombatDropout.held
      && expiredCombatDropout.action.reason === 'dynamic-profit-threshold-wait'
      && staleCombatState.lastAction.reason === 'dynamic-profit-threshold-wait'
      && staleCombatState.profitDropout === null
  });

  const changedDropoutState = {
    lastAction: dropoutProfit,
    lastFocus: buildActionFocus(dropoutProfit, { nowMs: 1000 }),
    lastSelectedAt: 1000,
    lastOverride: null,
    history: []
  };
  applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    changedDropoutState,
    { nowMs: 1100, holdMs: 1800 }
  );
  const changedDropout = applyFinalActionArbitrationCore(
    dropoutAction('dynamic-profit-threshold-wait'),
    changedDropoutState,
    { nowMs: 1200, holdMs: 1800 }
  );
  results.push({
    name: 'arbitration-profit-dropout-kind-change-does-not-extend-confirmation',
    passed: !changedDropout.held
      && changedDropout.action.reason === 'dynamic-profit-threshold-wait'
  });

  const resumedProfitState = {
    lastAction: dropoutProfit,
    lastFocus: buildActionFocus(dropoutProfit, { nowMs: 1000 }),
    lastSelectedAt: 1000,
    lastOverride: null,
    history: []
  };
  applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    resumedProfitState,
    { nowMs: 1100, holdMs: 1800 }
  );
  const resumedProfit = applyFinalActionArbitrationCore(
    dropoutProfit,
    resumedProfitState,
    { nowMs: 1200, holdMs: 1800 }
  );
  const restartedDropout = applyFinalActionArbitrationCore(
    dropoutAction('no-profitable-candidate'),
    resumedProfitState,
    { nowMs: 1300, holdMs: 1800 }
  );
  results.push({
    name: 'arbitration-profit-return-clears-dropout-confirmation-state',
    passed: !resumedProfit.held
      && resumedProfitState.profitDropout?.startedAt === 1300
      && restartedDropout.held
      && restartedDropout.override.dropoutAgeMs === 0
  });

  const immediateDropoutFixtures = [
    { action: { kind: 'leave', band: 'exit', reason: 'test-exit' }, previous: dropoutProfit },
    { action: { kind: 'flee', band: 'safety', reason: 'test-threat', urgent: true }, previous: dropoutProfit },
    { action: { kind: 'combat-live', band: 'combat', reason: 'test-combat' }, previous: dropoutProfit },
    { action: { kind: 'recover', band: 'recover', reason: 'recover-hp' }, previous: dropoutProfit },
    {
      action: {
        ...dropoutAction('no-profitable-candidate'),
        profitDropout: { kind: 'no-profitable-candidate', yieldable: true, targetValid: false }
      },
      previous: dropoutProfit
    },
    {
      action: {
        ...dropoutAction('dynamic-profit-threshold-wait'),
        profitDropout: {
          kind: 'dynamic-profit-threshold-wait',
          yieldable: true,
          targetValid: true,
          thresholdViolation: true
        }
      },
      previous: dropoutProfit
    },
    {
      action: dropoutAction('no-profitable-candidate'),
      previous: { ...dropoutProfit, target: { ...dropoutProfit.target, hp: 0, alive: false } }
    },
    {
      action: dropoutAction('no-profitable-candidate'),
      previous: { ...dropoutProfit, target: { ...dropoutProfit.target, invulnerable: true } }
    },
    {
      action: dropoutAction('no-profitable-candidate'),
      previous: { ...dropoutProfit, expired: true }
    },
    {
      action: { ...dropoutAction('no-profitable-candidate'), expired: true },
      previous: dropoutProfit
    },
    {
      action: { ...dropoutAction('no-profitable-candidate'), valid: false },
      previous: dropoutProfit
    },
    {
      action: {
        ...dropoutAction('no-profitable-candidate'),
        profitDropout: {
          kind: 'no-profitable-candidate',
          yieldable: false,
          targetValid: true
        }
      },
      previous: dropoutProfit
    },
    {
      action: {
        ...dropoutAction('no-profitable-candidate'),
        profitDropout: null
      },
      previous: dropoutProfit
    }
  ];
  results.push({
    name: 'arbitration-profit-dropout-never-delays-safety-recovery-invalid-or-nonyieldable-actions',
    passed: immediateDropoutFixtures.every((fixture, index) => {
      const fixtureState = {
        lastAction: fixture.previous,
        lastFocus: buildActionFocus(fixture.previous, { nowMs: 1000 }),
        lastSelectedAt: 1000,
        lastOverride: null,
        history: []
      };
      const selected = applyFinalActionArbitrationCore(fixture.action, fixtureState, {
        nowMs: 1100 + index,
        holdMs: 1800
      });
      return !selected.held && selected.action.reason === fixture.action.reason;
    })
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
      && switchResult.event.oscillating === false
      && switchResult.event.oscillationSequence.length === 0
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
      && oscillationResult.event.oscillationSequence.length === 2
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
    coinPickupJitterEnabled: true,
    coinPickupJitterMaxDistance: 180,
    coinPickupJitterMaxBacktrack: 90,
    coinPickupJitterMaxPulses: 1,
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

  results.push({
    name: 'coin-motion-allows-one-bounded-close-jitter',
    passed: coinPickupJitterAllowedCore(
      { dx: 1, dy: 1, distance: 120 },
      { dx: -1, dy: 1, distance: 70 },
      coinMotionOptions,
      0
    ) === true
      && coinPickupJitterAllowedCore(
        { dx: 1, dy: 1, distance: 120 },
        { dx: -1, dy: -1, distance: 70 },
        coinMotionOptions,
        0
      ) === false
      && coinPickupJitterAllowedCore(
        { dx: 1, dy: 1, distance: 120 },
        { dx: -1, dy: 1, distance: 70 },
        coinMotionOptions,
        1
      ) === false
      && coinPickupJitterAllowedCore(
        { dx: 1, dy: 1, distance: 500 },
        { dx: -1, dy: 1, distance: 70 },
        coinMotionOptions,
        0
      ) === false
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

  const earlyLooseCoins = Array.from({ length: 10 }, (_, index) => ({
    drop_id: `early-${index + 1}`,
    amount: 1,
    x: 1000 + index * 4000,
    y: 0,
    distance: 1000 + index * 4000
  }));
  const lateDenseRouteCoins = [
    { drop_id: 'late-a', amount: 1, x: 42000, y: 0, distance: 42000 },
    { drop_id: 'late-b', amount: 1, x: 42500, y: 0, distance: 42500 },
    { drop_id: 'late-c', amount: 1, x: 43000, y: 0, distance: 43000 }
  ];
  const lateRouteInput = [...earlyLooseCoins, ...lateDenseRouteCoins];
  const lateRouteOptions = {
    ...routeOptions,
    poolLimit: 12,
    clusterRadius: 1500,
    linkDistance: 2000,
    maxLinkDistance: 2500,
    maxDistance: 50000,
    staminaAffordable: cost => cost <= 100000,
    routeEligible: () => true
  };
  const selectedLateRoutePool = selectCoinRouteCandidatePoolCore(routeSelf, lateRouteInput, lateRouteOptions);
  const heldLateRoutePool = selectCoinRouteCandidatePoolCore(routeSelf, lateRouteInput, {
    ...lateRouteOptions,
    poolLimit: 2,
    heldRouteChoice: {
      type: 'coin',
      id: 'late-a',
      coinRouteIds: ['late-a', 'late-b', 'late-c']
    }
  });
  const selectedLateRoute = pickCoinRouteOpportunityCore(
    routeSelf,
    lateRouteInput,
    [],
    lateRouteOptions
  );
  results.push({
    name: 'coin-route-pool-keeps-late-dense-field-after-early-input-coins',
    passed: selectedLateRoutePool.length === 12
      && lateDenseRouteCoins.every(coin => selectedLateRoutePool.some(item => item.drop_id === coin.drop_id))
      && heldLateRoutePool.length === 3
      && lateDenseRouteCoins.every(coin => heldLateRoutePool.some(item => item.drop_id === coin.drop_id))
      && selectedLateRoute?.coinRoute?.ids?.join(',') === 'late-a,late-b,late-c'
  });

  const discountedRouteCoins = [
    { drop_id: 'discounted', amount: 10, x: 1000, y: 0, distance: 1000, profitScoreMultiplier: 0.5 },
    { drop_id: 'full', amount: 10, x: 2000, y: 0, distance: 2000 }
  ];
  const discountedRoute = buildCoinRouteFromAnchorCore(
    routeSelf,
    discountedRouteCoins[0],
    discountedRouteCoins,
    [],
    {
      ...routeOptions,
      coinValue: coin => Number(coin.amount || 0) * Number(coin.profitScoreMultiplier ?? 1)
    }
  );
  results.push({
    name: 'coin-route-scores-easy-kill-contested-coin-at-half-value',
    passed: discountedRoute?.coinRoute?.value === 20
      && discountedRoute.coinRoute.effectiveValue === 15
      && discountedRoute.routeValue === 20
      && discountedRoute.routeEffectiveValue === 15
      && discountedRoute.opportunityScore === 750
      && discountedRoute.coinRoute.points?.[0]?.profitScoreMultiplier === 0.5
  });

  const twoCoinAggregateRoute = buildCoinRouteFromAnchorCore(
    { x: -45369, y: -58449 },
    { drop_id: '823', amount: 1, x: -45410, y: -45344, distance: 13105 },
    [
      { drop_id: '823', amount: 1, x: -45410, y: -45344, distance: 13105 },
      { drop_id: '748', amount: 1, x: -45671, y: -43953, distance: 14499 }
    ],
    [],
    {
      ...routeOptions,
      linkDistance: 1500,
      maxLinkDistance: 2500,
      staminaAffordable: cost => cost <= 20000,
      routeEligible: route => Number(route.totalValue || 0) / Number(route.totalStaminaCost || Infinity) >= 1 / 10000
    }
  );
  results.push({
    name: 'coin-route-accepts-two-coin-aggregate-profit-route',
    passed: twoCoinAggregateRoute?.coinRoute?.ids?.join(',') === '823,748'
      && twoCoinAggregateRoute.coinRoute.legCount === 2
      && twoCoinAggregateRoute.coinRoute.value === 2
      && twoCoinAggregateRoute.coinRoute.staminaCost > 14500
      && twoCoinAggregateRoute.coinRoute.staminaCost < 14600
  });

  const eligibleRoute = buildCoinRouteFromAnchorCore(routeSelf, routeCoins[0], [
    ...routeCoins,
    { drop_id: '4', amount: 1, x: 4000, y: 0, distance: 4000 }
  ], [], {
    ...routeOptions,
    valueScore: (value, cost) => value === 3 ? 100 : (value === 4 ? 50 : value * 100000 / cost),
    routeEligible: route => Number(route.value || 0) >= 4
  });
  results.push({
    name: 'coin-route-prefers-eligible-route-over-higher-score-ineligible-route',
    passed: eligibleRoute?.coinRoute?.ids?.join(',') === '1,2,3,4'
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
  results.push({
    name: 'coin-route-closer-first-ignores-ineligible-near-coin',
    passed: coinRouteSkipsCloserFirstCoinCore(
      routeSelf,
      { drop_id: 'far-route', amount: 3, x: 30000, y: 0, distance: 30000, coinRoute: { firstDistance: 30000 } },
      [{ drop_id: 'near', amount: 1, x: 10000, y: 0, distance: 10000 }],
      { ...routeOptions, closerCoinEligible: coin => Number(coin.amount || 0) >= 2 }
    ) === false
  });

  const heldSingleCoin = {
    type: 'coin',
    id: 'bait',
    distance: 500,
    amount: 1
  };
  const farEligibleRoute = {
    drop_id: 'route-a',
    amount: 1,
    x: 10000,
    y: 0,
    distance: 10000,
    value: 2,
    staminaCost: 15000,
    coinRoute: {
      firstDistance: 10000,
      value: 2,
      staminaCost: 15000,
      ids: ['route-a', 'route-b']
    }
  };
  results.push({
    name: 'coin-route-held-single-yields-to-eligible-route',
    passed: coinRouteSkipsHeldSingleCoinCore(routeSelf, farEligibleRoute, heldSingleCoin, {
      ...routeOptions,
      nearbyFirstCoinDistance: 22000,
      routeEligible: () => true
    }) === false
  });

  const pickedRouteAroundHeldSingle = pickCoinRouteOpportunityCore(routeSelf, [
    { drop_id: 'bait', amount: 1, x: 500, y: 0, distance: 500 },
    { drop_id: 'route-a', amount: 1, x: 10000, y: 0, distance: 10000 },
    { drop_id: 'route-b', amount: 1, x: 12000, y: 0, distance: 12000 }
  ], [], {
    ...routeOptions,
    nearbyFirstCoinDistance: 22000,
    staminaAffordable: cost => cost <= 20000,
    routeEligible: route => Number(route.routeValue || route.totalValue || route.coinRoute?.value || 0) >= 2,
    heldChoice: heldSingleCoin
  });
  results.push({
    name: 'coin-route-pick-keeps-eligible-route-with-held-single',
    passed: pickedRouteAroundHeldSingle?.coinRoute?.ids?.join(',') === 'route-a,route-b'
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
    highValueCoinPriorityMaxDistance: 14500,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  });
  const farHighValueResult = chooseStableOpportunityCore([
    { type: 'enemy', id: 'enemy', distance: 100, score: 500, priorityTier: 1 },
    { type: 'coin', id: 'coin', amount: 10, x: 15001, y: 0, distance: 15001, score: 100, priorityTier: 1 }
  ], { key: 'coin:coin', type: 'coin', id: 'coin', until: 2000 }, null, {
    nowMs: 1000,
    highValueCoinPriorityAmount: 10,
    highValueCoinPriorityMaxDistance: 14500,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-high-value-coin-holds-enemy-switch-only-in-range',
    passed: highValueResult.chosen?.id === 'coin'
      && highValueResult.chosen?.held === true
      && highValueResult.chosen?.highValueCoinHold === true
      && farHighValueResult.chosen?.id === 'enemy'
      && farHighValueResult.chosen?.highValueCoinHold !== true
  });

  const lowCoinDisplacement = chooseStableOpportunityCore([
    { type: 'enemy', id: 'enemy', distance: 950, score: 500, priorityTier: 0, actionKind: 'seek-enemy' },
    { type: 'coin', id: 'coin', amount: 1, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ], { key: 'enemy:enemy', type: 'enemy', id: 'enemy', until: 99999 }, null, {
      nowMs: 1000,
      switchMargin: 0,
      switchRelativeMargin: 0,
      oscillationSwitchLimit: 0
    });
  const highValueCoinDisplacement = chooseStableOpportunityCore([
    { type: 'enemy', id: 'enemy', distance: 950, score: 500, priorityTier: 0, actionKind: 'seek-enemy' },
    { type: 'coin', id: 'high', amount: 15, x: 100, y: 0, distance: 100, score: 5000, priorityTier: 1 }
  ], { key: 'enemy:enemy', type: 'enemy', id: 'enemy', until: 99999 }, null, {
      nowMs: 1000,
      switchMargin: 0,
      switchRelativeMargin: 0,
      oscillationSwitchLimit: 0
    });
  const outscoredCoinDisplacement = chooseStableOpportunityCore([
    { type: 'enemy', id: 'enemy', distance: 950, score: 100, priorityTier: 0, actionKind: 'seek-enemy' },
    { type: 'coin', id: 'coin', amount: 1, x: 100, y: 0, distance: 100, score: 5000, priorityTier: 1 }
  ], { key: 'enemy:enemy', type: 'enemy', id: 'enemy', until: 99999 }, null, {
      nowMs: 1000,
      switchMargin: 0,
      switchRelativeMargin: 0,
      oscillationSwitchLimit: 0
    });
  results.push({
    name: 'opportunity-choice-holds-enemy-main-over-low-coin',
    passed: lowCoinDisplacement.chosen?.id === 'enemy'
      && lowCoinDisplacement.chosen?.enemyMainHold === true
      && highValueCoinDisplacement.chosen?.id === 'high'
      && highValueCoinDisplacement.chosen?.enemyMainHold !== true
      && outscoredCoinDisplacement.chosen?.id === 'coin'
      && outscoredCoinDisplacement.chosen?.enemyMainHold !== true
  });

  const activePrimaryBeatsPassiveEnemy = chooseStableOpportunityCore([
    {
      type: 'enemy',
      id: 'mango',
      distance: 22000,
      score: 18000000,
      priorityTier: 0,
      actionKind: 'seek-enemy',
      sourceTarget: { authority: 'realtime', alive: true, active: true, joinModeActive: true }
    },
    {
      type: 'enemy',
      id: 'feeli',
      distance: 14000,
      score: 350000,
      priorityTier: 1,
      actionKind: 'attack',
      sourceTarget: { authority: 'realtime', alive: true, active: false, joinModeActive: false, firing: false }
    }
  ], null, null, { nowMs: 1000, attackRange: 14500, oscillationSwitchLimit: 0 });
  const passiveCurrentYieldsToActivePrimary = chooseStableOpportunityCore([
    {
      type: 'enemy',
      id: 'mango',
      distance: 22000,
      score: 18000000,
      priorityTier: 0,
      actionKind: 'seek-enemy',
      sourceTarget: { authority: 'realtime', alive: true, active: true, joinModeActive: true }
    },
    {
      type: 'enemy',
      id: 'feeli',
      distance: 14000,
      score: 350000,
      priorityTier: 1,
      actionKind: 'attack',
      sourceTarget: { authority: 'realtime', alive: true, active: false, joinModeActive: false, firing: false }
    }
  ], { key: 'enemy:feeli', type: 'enemy', id: 'feeli', until: 0 }, null, {
    nowMs: 1000,
    attackRange: 14500,
    switchConfirmFrames: 3,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-lower-passive-enemy-cannot-displace-active-primary',
    passed: activePrimaryBeatsPassiveEnemy.chosen?.id === 'mango'
      && passiveCurrentYieldsToActivePrimary.chosen?.id === 'mango'
  });

  const remotePrimaryBeatsPassiveEnemy = chooseStableOpportunityCore([
    {
      type: 'remote-player-navigation',
      id: 'mango',
      distance: 220500,
      score: 18000000,
      priorityTier: 1,
      actionKind: 'seek-remote-player',
      sourceTarget: {
        authority: 'snapshot-navigation',
        classification: 'easy-kill-active',
        alive: true,
        active: true
      }
    },
    {
      type: 'enemy',
      id: 'feeli',
      distance: 14000,
      score: 350000,
      priorityTier: 1,
      actionKind: 'attack',
      sourceTarget: {
        authority: 'realtime',
        alive: true,
        active: false,
        joinModeActive: false,
        firing: false
      }
    }
  ], { key: 'enemy:feeli', type: 'enemy', id: 'feeli', until: 0 }, null, {
    nowMs: 1000,
    attackRange: 14500,
    switchConfirmFrames: 1,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-lower-passive-enemy-cannot-displace-remote-primary',
    passed: remotePrimaryBeatsPassiveEnemy.chosen?.id === 'mango'
      && remotePrimaryBeatsPassiveEnemy.chosen?.type === 'remote-player-navigation'
  });

  const establishedHighValueEnemyHoldsLowerPassiveEnemy = chooseStableOpportunityCore([
    {
      type: 'enemy',
      id: 'mango',
      distance: 22000,
      score: 18000000,
      priorityTier: 0,
      actionKind: 'seek-enemy',
      sourceTarget: { authority: 'realtime', alive: true, active: false, joinModeActive: false }
    },
    {
      type: 'enemy',
      id: 'feeli',
      distance: 14000,
      score: 350000,
      priorityTier: 1,
      actionKind: 'attack',
      sourceTarget: { authority: 'realtime', alive: true, active: false, joinModeActive: false, firing: false }
    }
  ], { key: 'enemy:mango', type: 'enemy', id: 'mango', until: 0 }, null, {
    nowMs: 1000,
    attackRange: 14500,
    switchConfirmFrames: 3,
    oscillationSwitchLimit: 0
  });
  results.push({
    name: 'opportunity-choice-established-high-value-enemy-holds-lower-passive-enemy',
    passed: establishedHighValueEnemyHoldsLowerPassiveEnemy.chosen?.id === 'mango'
      && establishedHighValueEnemyHoldsLowerPassiveEnemy.chosen?.enemyMainHold === true
      && establishedHighValueEnemyHoldsLowerPassiveEnemy.switchDiagnostics?.bestRejectedReason === 'hold-or-margin'
  });

  const afkFinishIncidentOpportunities = [
    {
      type: 'enemy', id: '36046', distance: 47824, score: 3252155, staminaCost: 76749,
      reward: 416, priorityTier: 1,
      sourceTarget: { userId: 36046, name: 'yongren', hp: 92, drop: 416, distance: 47824, active: false, alive: true }
    },
    {
      type: 'enemy', id: '32407', distance: 2683, score: 1534973, staminaCost: 16808,
      reward: 43, priorityTier: 1, actionKind: 'attack',
      sourceTarget: { userId: 32407, name: '白白', hp: 44, drop: 43, distance: 2683, active: false, alive: true }
    }
  ];
  const afkFinishIncident = chooseStableOpportunityCore(
    afkFinishIncidentOpportunities,
    { key: 'enemy:32407', type: 'enemy', id: '32407', until: 0 },
    { pendingKey: 'enemy:36046', pendingCount: 2 },
    { nowMs: 1000, attackRange: 14500, switchConfirmFrames: 3, oscillationSwitchLimit: 0 }
  );
  const afkFinishReleased = chooseStableOpportunityCore(
    afkFinishIncidentOpportunities.map(item => item.id === '32407'
      ? { ...item, staminaCost: 26000, sourceTarget: { ...item.sourceTarget, hp: 61 } }
      : item),
    { key: 'enemy:32407', type: 'enemy', id: '32407', until: 0 },
    { pendingKey: 'enemy:36046', pendingCount: 2 },
    { nowMs: 1000, attackRange: 14500, switchConfirmFrames: 3, oscillationSwitchLimit: 0 }
  );
  const afkFinishReleaseVariants = [
    { sourceTarget: { active: true } },
    { sourceTarget: { invulnerable: true } },
    { sourceTarget: { alive: false } },
    { distance: 14501, sourceTarget: { distance: 14501 } }
  ].map(overrides => chooseStableOpportunityCore(
    afkFinishIncidentOpportunities.map(item => item.id === '32407'
      ? { ...item, ...overrides, sourceTarget: { ...item.sourceTarget, ...(overrides.sourceTarget || {}) } }
      : item),
    { key: 'enemy:32407', type: 'enemy', id: '32407', until: 0 },
    { pendingKey: 'enemy:36046', pendingCount: 2 },
    { nowMs: 1000, attackRange: 14500, switchConfirmFrames: 3, oscillationSwitchLimit: 0 }
  ));
  const afkFinishDoesNotOverrideCoin = chooseStableOpportunityCore([
    { type: 'coin', id: 'large', amount: 20, distance: 1000, score: 5000000, staminaCost: 1000, reward: 20, priorityTier: 1 },
    afkFinishIncidentOpportunities[1]
  ], { key: 'enemy:32407', type: 'enemy', id: '32407', until: 0 }, {
    pendingKey: 'coin:large', pendingCount: 2
  }, { nowMs: 1000, attackRange: 14500, switchConfirmFrames: 3, oscillationSwitchLimit: 0 });
  results.push({
    name: 'opportunity-choice-finishes-near-damaged-afk-before-distant-high-drop-target',
    passed: afkFinishIncident.chosen?.id === '32407'
      && afkFinishIncident.chosen?.finishCommitment?.reason === 'afk-finish-commitment'
      && afkFinishIncident.switchDiagnostics?.switchBlocked === true
      && afkFinishIncident.switchDiagnostics?.bestRejectedReason === 'afk-finish-commitment'
      && afkFinishIncident.switchLock?.pendingCount === 0
      && afkFinishReleased.chosen?.id === '36046'
      && afkFinishReleaseVariants.every(result => result.chosen?.id === '36046')
      && afkFinishDoesNotOverrideCoin.chosen?.id === 'large'
  });

  const oscillationReturnOpportunities = [
    { type: 'coin', id: 'a', amount: 1, x: 100, y: 0, distance: 100, score: 130, priorityTier: 1 },
    { type: 'coin', id: 'b', amount: 2, x: 300, y: 0, distance: 300, score: 120, priorityTier: 1 },
  ];
  const oscillationCompetingOpportunities = [
    { type: 'coin', id: 'b', amount: 2, x: 300, y: 0, distance: 300, score: 140, priorityTier: 1 },
    { type: 'coin', id: 'a', amount: 1, x: 100, y: 0, distance: 100, score: 100, priorityTier: 1 }
  ];
  const opportunityOscillationResult = chooseStableOpportunityCore(oscillationReturnOpportunities,
    { key: 'coin:b', type: 'coin', id: 'b', until: 0 }, {
    pairKey: 'coin:a|coin:b',
    lastKey: 'coin:b',
    switchCount: 1,
    windowStartedAt: 900,
    lockedKey: '',
    blockedKey: '',
    lockedAt: 0,
    updatedAt: 900
  }, {
    nowMs: 1000,
    sameCoinRadius: 50,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 2,
    oscillationWindowMs: 30000,
    oscillationLockMs: 30000
  });
  const opportunityOscillationHeld = chooseStableOpportunityCore(oscillationCompetingOpportunities,
    { key: 'coin:a', type: 'coin', id: 'a', until: 0 },
    opportunityOscillationResult.switchLock,
    { nowMs: 1100, sameCoinRadius: 50, switchMargin: 0, switchRelativeMargin: 0, oscillationSwitchLimit: 2, oscillationWindowMs: 30000, oscillationLockMs: 30000 });
  const opportunityOscillationExpired = chooseStableOpportunityCore(oscillationCompetingOpportunities,
    { key: 'coin:a', type: 'coin', id: 'a', until: 0 },
    opportunityOscillationResult.switchLock,
    { nowMs: 31101, sameCoinRadius: 50, switchMargin: 0, switchRelativeMargin: 0, oscillationSwitchLimit: 2, oscillationWindowMs: 30000, oscillationLockMs: 30000 });
  const opportunityOscillationMissing = chooseStableOpportunityCore(
    oscillationCompetingOpportunities.filter(item => item.id === 'b'),
    { key: 'coin:a', type: 'coin', id: 'a', until: 0 },
    opportunityOscillationResult.switchLock,
    { nowMs: 1200, sameCoinRadius: 50, switchMargin: 0, switchRelativeMargin: 0, oscillationSwitchLimit: 2, oscillationWindowMs: 30000, oscillationLockMs: 30000 });
  const opportunityOscillationWindowReset = chooseStableOpportunityCore(oscillationReturnOpportunities,
    { key: 'coin:b', type: 'coin', id: 'b', until: 0 }, {
    pairKey: 'coin:a|coin:b',
    lastKey: 'coin:b',
    switchCount: 1,
    windowStartedAt: 900,
    lockedKey: '',
    blockedKey: '',
    lockedAt: 0,
    updatedAt: 900
  }, {
    nowMs: 30901,
    sameCoinRadius: 50,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 2,
    oscillationWindowMs: 30000,
    oscillationLockMs: 30000
  });
  const opportunityOscillationCurrentMissing = chooseStableOpportunityCore(
    oscillationCompetingOpportunities,
    null,
    opportunityOscillationResult.switchLock,
    { nowMs: 1200, sameCoinRadius: 50, switchMargin: 0, switchRelativeMargin: 0, oscillationSwitchLimit: 2, oscillationWindowMs: 30000, oscillationLockMs: 30000 });
  results.push({
    name: 'opportunity-choice-oscillation-locks-returned-target-and-releases',
    passed: opportunityOscillationResult.chosen?.id === 'a'
      && opportunityOscillationResult.chosen?.oscillationLocked === true
      && opportunityOscillationResult.switchLock?.lockedKey === 'coin:a'
      && opportunityOscillationResult.switchLock?.blockedKey === 'coin:b'
      && opportunityOscillationResult.switchLock?.switchCount === 2
      && opportunityOscillationResult.switchLock?.windowStartedAt === 900
      && opportunityOscillationResult.switchLock?.lockUntil === 31000
      && opportunityOscillationHeld.chosen?.id === 'a'
      && opportunityOscillationHeld.chosen?.oscillationLocked === true
      && opportunityOscillationExpired.chosen?.id === 'b'
      && opportunityOscillationExpired.chosen?.oscillationReleaseReason === 'lock-expired'
      && opportunityOscillationMissing.chosen?.id === 'b'
      && opportunityOscillationMissing.chosen?.oscillationReleaseReason === 'pair-ineligible'
      && opportunityOscillationWindowReset.chosen?.id === 'a'
      && opportunityOscillationWindowReset.chosen?.oscillationLocked === false
      && opportunityOscillationWindowReset.switchLock?.switchCount === 1
      && opportunityOscillationWindowReset.switchLock?.windowStartedAt === 30901
      && opportunityOscillationWindowReset.chosen?.oscillationReleaseReason === 'window-or-pair-reset'
      && opportunityOscillationCurrentMissing.chosen?.id === 'b'
      && opportunityOscillationCurrentMissing.chosen?.oscillationReleaseReason === 'current-missing'
  });

  const activeOscillationCurrent = {
    type: 'enemy',
    id: 'active-primary',
    targetActive: true,
    sourceTarget: {
      authority: 'realtime',
      alive: true,
      active: true,
      joinModeActive: true,
      invulnerable: false
    }
  };
  const activeOscillationCompetitor = {
    type: 'enemy',
    id: 'passive-detour',
    score: 100,
    priorityTier: 1,
    sourceTarget: {
      authority: 'realtime',
      alive: true,
      active: false,
      joinModeActive: false,
      invulnerable: false
    }
  };
  const activeOscillationLock = {
    pairKey: 'enemy:active-primary|enemy:passive-detour',
    lastKey: 'enemy:passive-detour',
    switchCount: 2,
    windowStartedAt: 900,
    lockedKey: 'enemy:active-primary',
    blockedKey: 'enemy:passive-detour',
    lockedAt: 1000,
    lockUntil: 31000,
    updatedAt: 1000,
    releaseReason: ''
  };
  const activeOscillationMissing = chooseStableOpportunityCore(
    [activeOscillationCompetitor],
    { ...activeOscillationCurrent, key: 'enemy:active-primary' },
    activeOscillationLock,
    {
      nowMs: 1200,
      switchMargin: 0,
      switchRelativeMargin: 0,
      oscillationSwitchLimit: 2,
      oscillationWindowMs: 30000,
      oscillationLockMs: 30000
    }
  );
  const activeOscillationExpired = chooseStableOpportunityCore(
    [activeOscillationCompetitor],
    { ...activeOscillationCurrent, key: 'enemy:active-primary' },
    activeOscillationLock,
    {
      nowMs: 31001,
      switchMargin: 0,
      switchRelativeMargin: 0,
      oscillationSwitchLimit: 2,
      oscillationWindowMs: 30000,
      oscillationLockMs: 30000
    }
  );
  results.push({
    name: 'opportunity-choice-active-realtime-lock-holds-through-missing-pair-member',
    passed: activeOscillationMissing.chosen?.id === 'active-primary'
      && activeOscillationMissing.chosen?.missingHold === true
      && activeOscillationMissing.chosen?.missingHoldReason === 'oscillation-lock-missing-target'
      && activeOscillationExpired.chosen?.id === 'passive-detour'
      && activeOscillationExpired.chosen?.oscillationReleaseReason === 'lock-expired'
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

  const remoteCompetitionCandidates = buildOpportunityCandidatesCore({ x: 0, y: 0 }, [], [{
    maxDistance: 5000,
    coins: [{ drop_id: 'visible', amount: 5, x: 1000, y: 0, distance: 1000, score: 10 }]
  }], [], null, {
    ...candidateOptions,
    remotePlayerCandidates: [{
      userId: 77,
      x: 90000,
      y: 0,
      drop: 50,
      distance: 90000,
      expectedReward: 50,
      staminaCost: 100,
      baseScore: 80,
      distanceFactor: 0.75,
      adjustedScore: 60
    }]
  });
  const remoteCompetitionChoice = chooseStableOpportunityCore(
    remoteCompetitionCandidates,
    null,
    null,
    { switchConfirmFrames: 1, switchMargin: 0, switchRelativeMargin: 0, oscillationSwitchLimit: 0 }
  );
  const visibleCompetitionCandidates = remoteCompetitionCandidates.map(item => item.type === 'remote-player-navigation'
    ? { ...item, adjustedScore: 1, score: 1, selectionScore: 1 }
    : item);
  const visibleCompetitionChoice = chooseStableOpportunityCore(
    visibleCompetitionCandidates,
    null,
    null,
    { switchConfirmFrames: 1, switchMargin: 0, switchRelativeMargin: 0, oscillationSwitchLimit: 0 }
  );
  results.push({
    name: 'opportunity-candidates-remote-player-competes-at-realtime-tier',
    passed: remoteCompetitionCandidates.some(item => item.type === 'remote-player-navigation'
        && item.priorityTier === 1
        && item.actionKind === 'seek-remote-player'
        && item.authority === 'snapshot-navigation')
      && remoteCompetitionChoice.chosen?.type === 'remote-player-navigation'
      && visibleCompetitionChoice.chosen?.type === 'coin'
  });
  const remoteNormalizedRoi = opportunityNetRoiCore({
    type: 'remote-player-navigation',
    reward: 87,
    staminaCost: 100000,
    score: 620744,
    selectionScore: 620744,
    scoreAuthority: 'adjusted-distance-score'
  });
  const realtimeNormalizedRoi = opportunityNetRoiCore({
    type: 'enemy',
    reward: 103,
    staminaCost: 33311,
    score: 1855863
  });
  results.push({
    name: 'opportunity-choice-normalizes-remote-roi-to-reward-per-stamina',
    passed: Math.abs(remoteNormalizedRoi - 0.00087) < 1e-12
      && Math.abs(realtimeNormalizedRoi - (103 / 33311)) < 1e-12
      && remoteNormalizedRoi < realtimeNormalizedRoi
  });
  const remoteSwitchCurrent = {
    key: 'coin:visible',
    type: 'coin',
    id: 'visible',
    until: 0,
    score: 10,
    staminaCost: 1000,
    reward: 5,
    x: 1000,
    y: 0,
    priorityTier: 1
  };
  const remoteSwitchOptions = {
    self: { x: 0, y: 0 },
    nowMs: 1000,
    switchConfirmFrames: 3,
    switchMargin: 0,
    switchRelativeMargin: 0,
    oscillationSwitchLimit: 0
  };
  const remoteSwitchOne = chooseStableOpportunityCore(
    remoteCompetitionCandidates,
    remoteSwitchCurrent,
    null,
    remoteSwitchOptions
  );
  const remoteSwitchTwo = chooseStableOpportunityCore(
    remoteCompetitionCandidates,
    remoteSwitchCurrent,
    remoteSwitchOne.switchLock,
    { ...remoteSwitchOptions, nowMs: 1100 }
  );
  const remoteSwitchThree = chooseStableOpportunityCore(
    remoteCompetitionCandidates,
    remoteSwitchCurrent,
    remoteSwitchTwo.switchLock,
    { ...remoteSwitchOptions, nowMs: 1200 }
  );
  results.push({
    name: 'opportunity-choice-remote-player-keeps-three-frame-switch-confirmation',
    passed: remoteSwitchOne.chosen?.type === 'coin'
      && remoteSwitchOne.switchDiagnostics?.confirmationFrames === 1
      && remoteSwitchTwo.chosen?.type === 'coin'
      && remoteSwitchTwo.switchDiagnostics?.confirmationFrames === 2
      && remoteSwitchThree.chosen?.type === 'remote-player-navigation'
      && remoteSwitchThree.switchDiagnostics?.confirmationFrames === 3
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

  const boundaryAtLimit = evaluateCenterActivityHardBoundaryCore({
    self: { x: DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM, y: 0 },
    action: { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime' }
  }, { highValueCoinMinAmount: 10 });
  const boundaryNormalCoin = evaluateCenterActivityHardBoundaryCore({
    self: { x: DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM + 1, y: 0 },
    action: { kind: 'coin', band: 'profit', target: { type: 'coin', id: 'ordinary', amount: 9 } }
  }, { highValueCoinMinAmount: 10 });
  const boundaryLargeCoin = evaluateCenterActivityHardBoundaryCore({
    self: { x: DEFAULT_CENTER_ACTIVITY_HARD_BOUNDARY_RADIUS_CM + 1, y: 0 },
    action: { kind: 'seek-coin', band: 'profit', target: { type: 'coin', id: 'large', amount: 10 } }
  }, { highValueCoinMinAmount: 10 });
  const boundaryLootDodge = highValueCoinTargetForActionCore({
    kind: 'combat-live',
    band: 'combat',
    realtimeLootPriority: true,
    lootTarget: { type: 'coin', id: 'loot', amount: 12 }
  }, 10);
  results.push({
    name: 'center-activity-hard-boundary-allows-only-large-coin-beyond-1300m',
    passed: boundaryAtLimit.outside === false
      && boundaryAtLimit.allowed === true
      && boundaryNormalCoin.outside === true
      && boundaryNormalCoin.allowed === false
      && boundaryNormalCoin.outsideByCm === 1
      && boundaryLargeCoin.allowed === true
      && boundaryLargeCoin.highValueCoin?.target?.id === 'large'
      && boundaryLootDodge?.source === 'loot-target'
      && boundaryLootDodge?.amount === 12
  });

  const outsideIdleStarted = updateOutsideCenterIdleCore(null, {
    nowMs: 1000,
    self: { x: 100001, y: 0 },
    action: { kind: 'wait', reason: 'no-profitable-candidate' }
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
      coinBaselineObservedAt: 9000,
      coinBaselineKeys: ['coin-old'],
      battleStaminaSpentStartMs: 123.4,
      staminaSpentMs: 567.8
    }
  ], [
    { drop_id: 'coin-a', x: 2050, y: 0, amount: 20, distance: 2050, score: 30, firstSeenAt: 9900 }
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
    {
      id: 'target', x: 2000, y: 0, at: 9000, resolvedAt: 9700, drop: 20, afk: true, action: 'attack',
      coinBaselineObservedAt: 9000, coinBaselineKeys: []
    }
  ], [
    { drop_id: 'score-win', x: 2100, y: 0, amount: 20, distance: 2100, score: 50, firstSeenAt: 9800 },
    { drop_id: 'lower-score', x: 2050, y: 0, amount: 20, distance: 2050, score: 20, firstSeenAt: 9800 },
    { drop_id: 'amount-win', x: 2500, y: 0, amount: 20, distance: 2500, score: 10, firstSeenAt: 9800 }
  ], postAttackCoinOptions);
  results.push({
    name: 'post-attack-drop-coin-selects-best-score-after-causal-match',
    passed: postAttackCoinBest.selected?.drop_id === 'score-win'
      && postAttackCoinBest.candidates.length === 3
  });

  const postAttackCoinCausality = { id: 'causal-target', x: 2000, y: 0, at: 9000, drop: 20 };
  results.push({
    name: 'post-attack-drop-coin-requires-new-exact-amount-or-source',
    passed: postAttackCoinMatchesAttackCore(
      { key: 'id:old', drop_id: 'old', x: 2050, y: 0, amount: 20, firstSeenAt: 8000 },
      { ...postAttackCoinCausality, coinBaselineObservedAt: 9000, coinBaselineKeys: ['id:old'] },
      postAttackCoinOptions
    ) === false
      && postAttackCoinMatchesAttackCore(
        { key: 'id:new-wrong', drop_id: 'new-wrong', x: 2050, y: 0, amount: 1, firstSeenAt: 9800 },
        { ...postAttackCoinCausality, coinBaselineObservedAt: 9000, coinBaselineKeys: [] },
        postAttackCoinOptions
      ) === false
      && postAttackCoinMatchesAttackCore(
        { key: 'id:new', drop_id: 'new', x: 2050, y: 0, amount: 20, firstSeenAt: 9800 },
        { ...postAttackCoinCausality, coinBaselineObservedAt: 9000, coinBaselineKeys: [] },
        postAttackCoinOptions
      ) === true
      && postAttackCoinMatchesAttackCore(
        { key: 'id:source', drop_id: 'source', source_user_id: 'causal-target', x: 9000, y: 0, amount: 1 },
        { ...postAttackCoinCausality, coinBaselineObservedAt: 9000, coinBaselineKeys: ['id:source'] },
        postAttackCoinOptions
      ) === true
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
    previousCombatTarget: { id: 9667, name: 'target', x: 4500, y: -1200, drop: 32 },
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
      && postKillTail.state?.x === 4500
      && postKillTail.state?.y === -1200
      && postKillDrop.state?.phase === 'drop-visible'
      && postKillDrop.state?.matchedCoinAmount === 32
      && postKillPicked.state === null
      && postKillPicked.reason === 'matched-player-drop-disappeared'
  });

  const postKillHighHpExit = updatePostKillSettlementCore(null, {
    nowMs: 2500,
    previousCombatTarget: { id: 9777, name: 'left-alive', hp: 80, drop: 32 },
    currentCombatTarget: null,
    combatMetrics: {
      targetId: '9777',
      targetName: 'left-alive',
      acceptedShots: 1,
      actualLastShotAt: 2300,
      actualLastShotTick: 200
    },
    visibleTargets: [],
    selfKillEvidence: [],
    playerDropCoins: [],
    snapshotTick: 205,
    disappearanceKillPlausible: false
  });
  const postKillHighHpConfirmed = updatePostKillSettlementCore(null, {
    nowMs: 2500,
    previousCombatTarget: { id: 9777, name: 'left-alive', hp: 80, drop: 32 },
    currentCombatTarget: null,
    combatMetrics: {
      targetId: '9777',
      targetName: 'left-alive',
      acceptedShots: 1,
      actualLastShotAt: 2300,
      actualLastShotTick: 200
    },
    visibleTargets: [],
    selfKillEvidence: [{ targetUserId: 9777, tick: 201 }],
    playerDropCoins: [],
    snapshotTick: 205,
    disappearanceKillPlausible: false
  });
  results.push({
    name: 'post-kill-settlement-rejects-high-hp-exit-without-evidence',
    passed: postKillHighHpExit.state === null
      && postKillHighHpExit.reason === 'disappearance-not-kill-plausible'
      && postKillHighHpConfirmed.state?.phase === 'drop-pending'
      && postKillHighHpConfirmed.state?.targetId === '9777'
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

  const switchedTargetKillEvidence = [{ targetUserId: 34083, tick: 90, kind: 'kill' }];
  const switchedTargetSettlementKey = postKillEvidenceKey(switchedTargetKillEvidence[0]);
  const switchedTargetPending = updatePostKillSettlementsCore({}, {
    nowMs: 1000,
    snapshotTick: 100,
    currentCombatTarget: { userId: 32551, name: 'other-active-target', hp: 100, alive: true },
    visibleTargets: [],
    selfKillEvidence: switchedTargetKillEvidence,
    playerDropCoins: [],
    targetMemory: [{
      userId: 34083,
      name: 'target-after-switch',
      drop: 19,
      dropKnown: true,
      x: 1000,
      y: 1000,
      at: 900
    }]
  }, {
    confirmedMs: 5000,
    pickupMs: 45000,
    tickMs: 50,
    maxEntries: 4
  });
  const switchedTargetDrop = updatePostKillSettlementsCore(switchedTargetPending.states, {
    nowMs: 1200,
    snapshotTick: 104,
    currentCombatTarget: { userId: 32551, name: 'other-active-target', hp: 100, alive: true },
    visibleTargets: [],
    selfKillEvidence: switchedTargetKillEvidence,
    playerDropCoins: [{
      drop_id: 'drop-19',
      source_user_id: 34083,
      amount: 19,
      created_tick: 91,
      x: 1100,
      y: 1000
    }],
    targetMemory: [{ userId: 34083, name: 'target-after-switch', drop: 19, dropKnown: true, x: 1000, y: 1000 }]
  }, {
    confirmedMs: 5000,
    pickupMs: 45000,
    tickMs: 50,
    maxEntries: 4
  });
  const switchedTargetDropDisappeared = updatePostKillSettlementsCore(switchedTargetDrop.states, {
    nowMs: 1300,
    snapshotTick: 105,
    currentCombatTarget: { userId: 32551, name: 'other-active-target', hp: 100, alive: true },
    visibleTargets: [],
    selfKillEvidence: switchedTargetKillEvidence,
    playerDropCoins: [],
    targetMemory: []
  }, {
    confirmedMs: 5000,
    pickupMs: 45000,
    tickMs: 50,
    maxEntries: 4
  });
  const switchedTargetReplayed = updatePostKillSettlementsCore(switchedTargetDropDisappeared.states, {
    nowMs: 1400,
    snapshotTick: 106,
    currentCombatTarget: { userId: 32551, name: 'other-active-target', hp: 100, alive: true },
    visibleTargets: [],
    selfKillEvidence: switchedTargetKillEvidence,
    playerDropCoins: [],
    targetMemory: []
  }, {
    confirmedMs: 5000,
    pickupMs: 45000,
    tickMs: 50,
    maxEntries: 4
  });
  results.push({
    name: 'post-kill-settlements-track-drop-after-combat-target-switch',
    passed: switchedTargetPending.selected?.targetId === '34083'
      && switchedTargetPending.selected?.phase === 'drop-pending'
      && switchedTargetPending.states[switchedTargetSettlementKey]?.targetDrop === 19
      && switchedTargetDrop.selected?.phase === 'drop-visible'
      && switchedTargetDrop.selected?.matchedCoinKey === 'drop-19'
      && switchedTargetDrop.selected?.matchedCoinAmount === 19
      && switchedTargetDropDisappeared.states[switchedTargetSettlementKey]?.active === false
      && switchedTargetReplayed.states[switchedTargetSettlementKey]?.active === false
  });

  // A drop collected inside our own pickup radius settles the generation at once.
  // The coin transport is the snapshot stream, so between the kill and the next
  // snapshot the coin can already be gone: `drop-pending` then has no visible coin
  // to match and only the timeout could end it.  Reproduces target 24401 at
  // 2026-08-30T16:26:48Z (Drop 8, pickup row 953ms later, ~3.1s wasted wait).
  const pickupSettlementEvidence = [{ targetUserId: 24401, tick: 31884, kind: 'kill' }];
  const pickupSettlementKey = postKillEvidenceKey(pickupSettlementEvidence[0]);
  const pickupSettlementOptions = { confirmedMs: 5000, pickupMs: 45000, tickMs: 50, maxEntries: 8 };
  const pickupSettlementBase = {
    visibleTargets: [],
    selfKillEvidence: pickupSettlementEvidence,
    playerDropCoins: [],
    targetMemory: [{
      userId: 24401,
      name: 'Dyasher',
      drop: 8,
      dropKnown: true,
      x: 8912,
      y: 79277,
      at: 1788107200000
    }]
  };
  const pickupSettlementOpenedAt = 1788107208317;
  const pickupSettlementOpened = updatePostKillSettlementsCore({}, {
    ...pickupSettlementBase,
    nowMs: pickupSettlementOpenedAt,
    snapshotTick: 31901,
    coinPickups: []
  }, pickupSettlementOptions);
  const pickupSettlementRow = [{
    key: 'id:298',
    amount: 8,
    at: pickupSettlementOpenedAt + 953,
    reason: 'realtime-snapshot-coin-disappeared-near-path'
  }];
  const pickupSettled = updatePostKillSettlementsCore(pickupSettlementOpened.states, {
    ...pickupSettlementBase,
    nowMs: pickupSettlementOpenedAt + 1009,
    snapshotTick: 31922,
    coinPickups: pickupSettlementRow
  }, pickupSettlementOptions);
  results.push({
    name: 'post-kill-settlement-settles-on-collected-drop-pickup-evidence',
    passed: pickupSettlementOpened.selected?.phase === 'drop-pending'
      && pickupSettled.states[pickupSettlementKey]?.active === false
      && pickupSettled.states[pickupSettlementKey]?.phase === 'settled'
      && pickupSettled.states[pickupSettlementKey]?.terminalReason === 'matched-drop-picked-up'
      && pickupSettled.states[pickupSettlementKey]?.matchedCoinKey === 'id:298'
      && pickupSettled.states[pickupSettlementKey]?.matchedCoinAmount === 8
      && pickupSettled.states[pickupSettlementKey]?.matchedCoinAuthority === 'snapshot'
      && pickupSettled.states[pickupSettlementKey]?.pickupEvidence === true
      && pickupSettled.selected === null
      && pickupSettled.activeCount === 0
  });

  // The pickup row only settles the kill it belongs to: a different amount, an
  // observation older than the generation, and a second equal-Drop kill claiming an
  // already-consumed row all have to leave `drop-pending` untouched.
  const pickupAmountMismatch = updatePostKillSettlementsCore(pickupSettlementOpened.states, {
    ...pickupSettlementBase,
    nowMs: pickupSettlementOpenedAt + 1000,
    snapshotTick: 31922,
    coinPickups: [{
      key: 'id:999',
      amount: 14,
      at: pickupSettlementOpenedAt + 500,
      reason: 'realtime-snapshot-coin-disappeared-near-path'
    }]
  }, pickupSettlementOptions);
  const pickupStaleObservation = updatePostKillSettlementsCore(pickupSettlementOpened.states, {
    ...pickupSettlementBase,
    nowMs: pickupSettlementOpenedAt + 1000,
    snapshotTick: 31922,
    coinPickups: [{
      key: 'id:279',
      amount: 8,
      at: pickupSettlementOpenedAt - 30000,
      reason: 'realtime-snapshot-coin-disappeared-near-path'
    }]
  }, pickupSettlementOptions);
  const pickupSecondKillEvidence = [{ targetUserId: 5625, tick: 31930, kind: 'kill' }];
  const pickupSecondKillKey = postKillEvidenceKey(pickupSecondKillEvidence[0]);
  const pickupSecondKill = updatePostKillSettlementsCore(pickupSettled.states, {
    ...pickupSettlementBase,
    selfKillEvidence: [...pickupSettlementEvidence, ...pickupSecondKillEvidence],
    targetMemory: [
      ...pickupSettlementBase.targetMemory,
      { userId: 5625, name: 'equal-drop-target', drop: 8, dropKnown: true, x: 8900, y: 79280, at: pickupSettlementOpenedAt + 1000 }
    ],
    nowMs: pickupSettlementOpenedAt + 1109,
    snapshotTick: 31932,
    coinPickups: pickupSettlementRow
  }, pickupSettlementOptions);
  results.push({
    name: 'post-kill-settlement-pickup-evidence-requires-matching-unconsumed-coin',
    passed: pickupAmountMismatch.states[pickupSettlementKey]?.active === true
      && pickupAmountMismatch.states[pickupSettlementKey]?.phase === 'drop-pending'
      && pickupStaleObservation.states[pickupSettlementKey]?.active === true
      && pickupStaleObservation.states[pickupSettlementKey]?.phase === 'drop-pending'
      && pickupSecondKill.states[pickupSecondKillKey]?.active === true
      && pickupSecondKill.states[pickupSecondKillKey]?.phase === 'drop-pending'
  });

  // Own-damage attribution evidence gate: only a target we actually damaged, whose
  // last observed HP was low and which is no longer visibly alive, opens a record.
  const ownDamageEvidenceAccepted = ownDamageSettlementEvidenceCore({
    targetId: 31361,
    damageFromStart: 99,
    lastObservedHp: 1,
    visiblyAlive: false,
    authority: 'realtime'
  }, { lowHpThreshold: 50 });
  const ownDamageEvidenceNoDamage = ownDamageSettlementEvidenceCore({
    targetId: 31361,
    damageFromStart: 0,
    lastObservedHp: 1,
    visiblyAlive: false,
    authority: 'realtime'
  }, { lowHpThreshold: 50 });
  const ownDamageEvidenceHealthy = ownDamageSettlementEvidenceCore({
    targetId: 31361,
    damageFromStart: 40,
    lastObservedHp: 60,
    visiblyAlive: false,
    authority: 'realtime'
  }, { lowHpThreshold: 50 });
  const ownDamageEvidenceStillAlive = ownDamageSettlementEvidenceCore({
    targetId: 31361,
    damageFromStart: 99,
    lastObservedHp: 1,
    visiblyAlive: true,
    authority: 'realtime'
  }, { lowHpThreshold: 50 });
  const ownDamageEvidenceSnapshot = ownDamageSettlementEvidenceCore({
    targetId: 31361,
    damageFromStart: 99,
    lastObservedHp: 1,
    visiblyAlive: false,
    authority: 'snapshot'
  }, { lowHpThreshold: 50 });
  results.push({
    name: 'own-damage-settlement-evidence-requires-damage-low-hp-and-realtime',
    passed: ownDamageEvidenceAccepted.active === true
      && ownDamageEvidenceAccepted.reason === 'own-damage-progress-without-kill-evidence'
      && ownDamageEvidenceNoDamage.active === false
      && ownDamageEvidenceNoDamage.reason === 'no-own-damage-progress'
      && ownDamageEvidenceHealthy.active === false
      && ownDamageEvidenceHealthy.reason === 'last-observed-hp-not-low'
      && ownDamageEvidenceStillAlive.active === false
      && ownDamageEvidenceStillAlive.reason === 'target-still-visibly-alive'
      && ownDamageEvidenceSnapshot.active === false
      && ownDamageEvidenceSnapshot.reason === 'non-realtime-evidence'
  });

  // The record must exist in `states` so the drop-race observer can settle it, and
  // must never become `selected`: selection drives settlement approach movement,
  // priority coin labelling and the restart-readiness blocker.
  const ownDamageOptions = { confirmedMs: 5000, pickupMs: 45000, tickMs: 50, maxEntries: 4 };
  const ownDamageOpened = updatePostKillSettlementsCore({}, {
    nowMs: 2000,
    snapshotTick: 200,
    currentCombatTarget: null,
    visibleTargets: [],
    selfKillEvidence: [],
    playerDropCoins: [],
    targetMemory: [{ userId: 31361, name: 'damaged-target', drop: 460, dropKnown: true, x: 500, y: -700 }],
    ownDamageSettlementEvidence: [{
      ...ownDamageEvidenceAccepted,
      targetName: 'damaged-target',
      x: 500,
      y: -700,
      authority: 'realtime'
    }]
  }, ownDamageOptions);
  const ownDamageKey = Object.keys(ownDamageOpened.states || {}).find(key => key.startsWith('own-damage:')) || '';
  const ownDamageReappeared = updatePostKillSettlementsCore(ownDamageOpened.states, {
    nowMs: 2100,
    snapshotTick: 202,
    currentCombatTarget: null,
    visibleTargets: [{ userId: 31361, name: 'damaged-target', hp: 30, alive: true }],
    selfKillEvidence: [],
    playerDropCoins: [],
    targetMemory: []
  }, ownDamageOptions);
  results.push({
    name: 'own-damage-settlement-observes-drop-race-without-being-selected',
    passed: Boolean(ownDamageKey)
      && ownDamageOpened.states[ownDamageKey]?.ownDamageAttribution === true
      && ownDamageOpened.states[ownDamageKey]?.active === true
      && ownDamageOpened.states[ownDamageKey]?.targetDrop === 460
      && ownDamageOpened.states[ownDamageKey]?.killAttribution === 'external-or-unknown'
      && ownDamageOpened.selected === null
      && ownDamageReappeared.states[ownDamageKey]?.active === false
      && ownDamageReappeared.states[ownDamageKey]?.terminalReason === 'target-reappeared-alive'
  });

  // A real kill or primary-disappearance settlement always owns the target first;
  // own-damage attribution only fills the gap where neither exists.
  const ownDamageKillEvidence = [{ targetUserId: 31361, tick: 210, kind: 'kill' }];
  const ownDamageYieldsToKill = updatePostKillSettlementsCore({}, {
    nowMs: 2200,
    snapshotTick: 211,
    currentCombatTarget: null,
    visibleTargets: [],
    selfKillEvidence: ownDamageKillEvidence,
    playerDropCoins: [],
    targetMemory: [{ userId: 31361, name: 'damaged-target', drop: 460, dropKnown: true, x: 500, y: -700, at: 2100 }],
    ownDamageSettlementEvidence: [{ ...ownDamageEvidenceAccepted, authority: 'realtime' }]
  }, ownDamageOptions);
  results.push({
    name: 'own-damage-settlement-yields-to-kill-evidence',
    passed: Object.keys(ownDamageYieldsToKill.states || {}).every(key => !key.startsWith('own-damage:'))
      && ownDamageYieldsToKill.selected?.targetId === '31361'
      && ownDamageYieldsToKill.selected?.ownDamageAttribution !== true
  });

  // Production regression (2026-08-31 12:19:25 UTC, target 31361): the legacy disappearance
  // settlement is created after the own-damage block, so the creation-time duplicate check
  // cannot see it and the same target opened both records in one tick — and that drop was
  // actually won (`settled` / `self-drop-increase`). The post-pass must drop the weaker
  // duplicate while leaving a lone own-damage record intact.
  const ownDamageDuplicateContext = {
    nowMs: 2300,
    snapshotTick: 500,
    currentCombatTarget: null,
    previousCombatTarget: {
      userId: 31361, name: 'damaged-target', hp: 1, drop: 11, x: 100, y: 200, firstSeenTick: 400
    },
    combatMetrics: {
      targetId: 31361, targetName: 'damaged-target', targetDamage: 99,
      acceptedShots: 12, actualLastShotAt: 2000, lastAcceptedShotTick: 495,
      startedTick: 400, startedAt: 1000
    },
    visibleTargets: [],
    selfKillEvidence: [],
    playerDropCoins: [],
    targetMemory: [],
    disappearanceKillPlausible: true,
    ownDamageSettlementEvidence: [{ ...ownDamageEvidenceAccepted, authority: 'realtime' }]
  };
  const ownDamageDuplicate = updatePostKillSettlementsCore({}, ownDamageDuplicateContext, ownDamageOptions);
  const ownDamageDuplicateKeys = Object.keys(ownDamageDuplicate.states || {});
  const ownDamageAloneKeys = Object.keys(updatePostKillSettlementsCore({}, {
    ...ownDamageDuplicateContext,
    previousCombatTarget: null,
    combatMetrics: null,
    disappearanceKillPlausible: false
  }, ownDamageOptions).states || {});
  results.push({
    name: 'own-damage-settlement-drops-duplicate-of-a-later-created-real-settlement',
    passed: ownDamageDuplicateKeys.length > 0
      && ownDamageDuplicateKeys.every(key => !key.startsWith('own-damage:'))
      && ownDamageAloneKeys.filter(key => key.startsWith('own-damage:')).length === 1
  });

  // Outward drift away from a low-HP high-value primary target loses the kill race
  // that closing distance would win; only the generic back-away branch is held.
  const rewardFinishSuppressed = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: true,
    self: { hp: 100 },
    target: { hp: 40, drop: 460, distance: 3183 },
    distanceCm: 3183
  }, {});
  const rewardFinishHighHpTarget = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: true,
    self: { hp: 100 },
    target: { hp: 90, drop: 460, distance: 3183 },
    distanceCm: 3183
  }, {});
  const rewardFinishLowDrop = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: true,
    self: { hp: 100 },
    target: { hp: 40, drop: 2, distance: 3183 },
    distanceCm: 3183
  }, {});
  const rewardFinishHurtSelf = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: true,
    self: { hp: 35 },
    target: { hp: 40, drop: 460, distance: 3183 },
    distanceCm: 3183
  }, {});
  const rewardFinishInsidePickup = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: true,
    self: { hp: 100 },
    target: { hp: 40, drop: 460, distance: 120 },
    distanceCm: 120
  }, {});
  const rewardFinishSecondary = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: false,
    self: { hp: 100 },
    target: { hp: 40, drop: 460, distance: 3183 },
    distanceCm: 3183
  }, {});
  const rewardFinishDisabled = rewardFinishBackAwaySuppressionPolicy({
    primaryTarget: true,
    self: { hp: 100 },
    target: { hp: 40, drop: 460, distance: 3183 },
    distanceCm: 3183
  }, { combatRewardFinishBackAwayHoldEnabled: false });
  results.push({
    name: 'reward-finish-back-away-hold-blocks-only-rewarding-low-hp-primary-drift',
    passed: rewardFinishSuppressed.suppress === true
      && rewardFinishSuppressed.reason === 'reward-finish-no-outward-drift'
      && rewardFinishHighHpTarget.suppress === false
      && rewardFinishHighHpTarget.reason === 'target-above-finish-hp'
      && rewardFinishLowDrop.suppress === false
      && rewardFinishLowDrop.reason === 'target-drop-not-rewarding'
      && rewardFinishHurtSelf.suppress === false
      && rewardFinishHurtSelf.reason === 'self-hp-not-healthy'
      && rewardFinishInsidePickup.suppress === false
      && rewardFinishInsidePickup.reason === 'inside-pickup-radius'
      && rewardFinishSecondary.suppress === false
      && rewardFinishSecondary.reason === 'not-primary-target'
      && rewardFinishDisabled.suppress === false
      && rewardFinishDisabled.reason === 'reward-finish-hold-disabled'
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
    passed: hpExitThresholds.criticalHp === 30
      && COMBAT_CONSTANTS.LEAVE_SURVIVAL_MARGIN_HP === 20
      && hpExitThresholds.lowHp === 50
      && hpExitThresholds.disadvantageHpGap === 20
      && evaluateCombatHpExitCore({ selfHp: 30, targetHp: 10 })?.rule === 'critical-hp'
      && evaluateCombatHpExitCore({ selfHp: 31, targetHp: 31 }) === null
      && evaluateCombatHpExitCore({ selfHp: 49, targetHp: 50 })?.rule === 'low-hp-behind'
      && evaluateCombatHpExitCore({ selfHp: 49, targetHp: 49 }) === null
      && evaluateCombatHpExitCore({ selfHp: 80, targetHp: 100 })?.rule === 'clear-hp-gap'
      && evaluateCombatHpExitCore({ selfHp: 80, targetHp: 99 }) === null
  });

  results.push({
    name: 'combat-exit-does-not-leave-winning-or-unattributed-healthy-fight',
    passed: evaluateCombatHpExitCore({ selfHp: 94, targetHp: 46 }) === null
      && evaluateCombatHpExitCore({ selfHp: 65, targetHp: null }) === null
      && evaluateCombatHpExitCore({ selfHp: 30, targetHp: null })?.reason === 'combat-critical-hp-leave'
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
  const predictedLatchedRateLoss = evaluatePredictedLeaveHpCore({
    selfHp: 44,
    directHits: 0,
    unavoidableHits: 0,
    recentDamage: 0,
    recentDamageWindowMs: 0,
    latchedDamageRateHpPerSecond: 15,
    commandDelayMs: 250
  });
  const predictedPressureBoundary = evaluatePredictedLeaveHpCore({
    selfHp: 41,
    directHits: 5,
    unavoidableHits: 5,
    recentDamage: 0,
    recentDamageWindowMs: 0,
    commandDelayMs: 250
  });
  results.push({
    name: 'combat-exit-uses-only-current-unavoidable-collision-damage',
    passed: predictedCritical.shouldLeave === true
      && predictedCritical.windowMs === 1250
      && predictedCritical.predictedDamage === 3
      && predictedCritical.riskAdjustedHp === 12
      && predictedRateLoss.shouldLeave === false
      && predictedRateLoss.predictedDamage === 0
      && predictedRateLoss.predictionBasis === 'realtime-unavoidable-collision'
      && predictedSafe.shouldLeave === false
      && predictedLatchedRateLoss.shouldLeave === false
      && predictedLatchedRateLoss.predictedDamage === 0
      && predictedPressureBoundary.shouldLeave === true
      && predictedPressureBoundary.riskAdjustedHp === 20
  });

  results.push({
    name: 'combat-incoming-shooter-switch-requires-hit-corridor-and-urgency',
    passed: incomingBulletHasCollisionRiskCore({ cpa: 90, timeToImpact: 500, remainingTicks: 30 })
      && !incomingBulletHasCollisionRiskCore({ cpa: 91, timeToImpact: 500, remainingTicks: 30 })
      && !incomingBulletHasCollisionRiskCore({ cpa: null })
      && incomingBulletRequiresTargetSwitchCore({ cpa: 50, distance: 6500, timeToImpact: 1200, remainingTicks: 30 }, {
        combatTargetSwitchIncomingDistance: 6500,
        combatTargetSwitchIncomingTimeMs: 900
      })
      && !incomingBulletRequiresTargetSwitchCore({ cpa: 1000, distance: 1000, timeToImpact: 100, remainingTicks: 30 }, {
        combatTargetSwitchIncomingDistance: 6500,
        combatTargetSwitchIncomingTimeMs: 900
      })
  });

  const recentAfkCommitment = recentAfkAttackCommitmentCore({
    kind: 'attack',
    target: {
      userId: 31265,
      name: 'kasou',
      active: false,
      alive: true,
      afkAttackContinuation: {
        source: 'recent-actual-shot',
        at: 1000,
        graceMs: 5000
      }
    }
  }, [{ userId: 31265, name: 'kasou', active: false, alive: true, hp: 67, distance: 7882 }], {
    nowMs: 2446,
    combatAttackRange: 14500
  });
  const expiredAfkCommitment = recentAfkAttackCommitmentCore({
    kind: 'attack',
    target: {
      userId: 31265,
      active: false,
      alive: true,
      afkAttackContinuation: { source: 'recent-actual-shot', at: 1000, graceMs: 5000 }
    }
  }, [{ userId: 31265, active: false, alive: true, hp: 67, distance: 7882 }], {
    nowMs: 7001,
    combatAttackRange: 14500
  });
  const lowStaminaProactive = checkProactiveActiveCombatGates({}, {
    userId: 19677,
    active: true,
    firing: false,
    drop: 551
  }, {
    selfStamina5s: 289,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 200000
  });
  const lowStaminaDefensive = checkProactiveActiveCombatGates({}, {
    userId: 19677,
    active: true,
    firing: true,
    drop: 551
  }, {
    selfStamina5s: 289,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 200000
  });
  const lowStaminaProfitCandidate = proactiveActiveProfitEligible({
    userId: 19677,
    current_join_mode: 'Active',
    active: true,
    firing: false,
    drop: 551
  }, {
    selfStamina5s: 289,
    proactiveActiveCombatMinimumStamina5s: 5600,
    opportunityStaminaBudget: 200000
  });
  results.push({
    name: 'combat-proactive-active-respects-recent-afk-shot-and-immediate-stamina',
    passed: recentAfkCommitment?.reason === 'recent-afk-attack-commitment'
      && recentAfkCommitment.targetId === '31265'
      && recentAfkCommitment.ageMs === 1446
      && expiredAfkCommitment === null
      && lowStaminaProactive.allowed === false
      && lowStaminaProactive.reason === 'insufficient-immediate-stamina'
      && lowStaminaProfitCandidate === true
      && lowStaminaDefensive.allowed === true
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

  const coverageInput = {
    targetId: 'target-1',
    createdTick: 100,
    executionDelayTicks: 5,
    controlIntervalTicks: 4,
    flightTicks: 16,
    predictedShooterOrigin: { x: 0, y: 0 },
    predictedTargetAtCreation: { x: 8000, y: 0, vx: 0, vy: 50 },
    baselineAim: { x: 8000, y: 800 },
    target: { x: 7750, y: 0, vx: 0, vy: 50 },
    routeCandidates: [
      { hypothesis: 'stop', probability: 0.4, x: 8000, y: 0, uncertaintyCm: 800 },
      { hypothesis: 'continue', probability: 0.3, x: 8000, y: 800, uncertaintyCm: 800 },
      { hypothesis: 'left-turn', probability: 0.15, x: 7200, y: 0, uncertaintyCm: 800 },
      { hypothesis: 'right-turn', probability: 0.15, x: 8800, y: 0, uncertaintyCm: 800 }
    ]
  };
  const coveragePaths = buildTrajectoryPathsCore(coverageInput, { maxTrajectoryTicks: 30 });
  const firstCoverage = buildTrajectoryCoveragePlanCore(coverageInput, { minimumMarginalCoverage: 0 });
  const coveredStop = firstCoverage.selected ? {
    id: 'covered-stop',
    targetId: 'target-1',
    startX: 0,
    startY: 0,
    targetX: firstCoverage.selected.aimX,
    targetY: firstCoverage.selected.aimY,
    observedTick: 95,
    predictedCreatedTick: 100,
    expireTick: 130
  } : null;
  const secondCoverage = buildTrajectoryCoveragePlanCore({
    ...coverageInput,
    existingShots: [coveredStop]
  }, { minimumMarginalCoverage: 0 });
  const stopPath = coveragePaths.find(path => path.id === 'stop:immediate');
  const directStopMiss = shotCorridorMissCore({
    startX: 0,
    startY: 0,
    aimX: 8000,
    aimY: 0,
    startTick: 100,
    expireTick: 130
  }, stopPath, coverageInput, {});
  const continuousPath = {
    points: [{ x: 0, y: 0 }, { x: 500, y: 100 }, { x: 1000, y: -100 }],
    weight: 1,
    uncertaintyCm: 90
  };
  const continuousMiss = shotCorridorMissCore({
    startX: 0,
    startY: 0,
    aimX: 1000,
    aimY: 0,
    startTick: 100,
    expireTick: 130
  }, continuousPath, { createdTick: 100 }, {});
  const robustSelection = selectRobustTrajectoryAimCore(coverageInput, {
    maxTrajectoryTicks: 30,
    maxRouteClusters: 4,
    maxShotCandidates: 12,
    bulletSpeedCmPerTick: 500,
    bulletLifetimeTicks: 30,
    bulletRangeCm: 15000,
    hitRadiusCm: 90
  });
  const unreachableCoverage = buildTrajectoryCoveragePlanCore({
    ...coverageInput,
    predictedTargetAtCreation: { x: 16000, y: 0, vx: 0, vy: 0 },
    target: { x: 16000, y: 0, vx: 0, vy: 0 },
    routeCandidates: [{ hypothesis: 'stationary-beyond-range', probability: 1, x: 16000, y: 0, uncertaintyCm: 0 }]
  }, {
    bulletSpeedCmPerTick: 500,
    bulletLifetimeTicks: 30,
    bulletRangeCm: 15000,
    hitRadiusCm: 90,
    minimumMarginalCoverage: 0
  });
  results.push({
    name: 'combat-shot-coverage-bounds-paths-and-selects-complementary-second-shot',
    passed: coveragePaths.length === 8
      && firstCoverage.active === true
      && secondCoverage.active === true
      && secondCoverage.selected?.id !== firstCoverage.selected?.id
      && secondCoverage.selected?.marginalCoverage > 0
      && secondCoverage.selected?.coverageMassAfter > firstCoverage.selected?.coverageMassAfter
      && directStopMiss <= 90
      && continuousMiss <= 1e-6
      && robustSelection.selected?.physicallyReachable === true
      && robustSelection.candidateCount > 0
      && robustSelection.candidateCount <= 12
      && Number.isFinite(robustSelection.selected?.robustScore)
      && typeof robustSelection.selected?.improvementQualified === 'boolean'
      && Number.isFinite(robustSelection.baseline?.robustScore)
      && firstCoverage.candidates.every(candidate => candidate.physicallyReachable === true
        && candidate.reachabilityReason === 'reachable')
      && unreachableCoverage.active === false
      && unreachableCoverage.candidateCount === 0
      && unreachableCoverage.reason === 'no-shot-candidates'
  });

  const staleCoverage = buildTrajectoryCoveragePlanCore({
    ...coverageInput,
    existingShots: [{
      id: 'expired',
      targetId: 'target-1',
      startX: 0,
      startY: 0,
      targetX: 8000,
      targetY: 0,
      createdTick: 60,
      expireTick: 90
    }]
  }, { minimumMarginalCoverage: 0 });
  results.push({
    name: 'combat-shot-coverage-ignores-expired-and-other-target-shots',
    passed: staleCoverage.existingShotCount === 0
      && buildTrajectoryCoveragePlanCore({
        ...coverageInput,
        existingShots: [{
          id: 'other-target',
          targetId: 'target-2',
          startX: 0,
          startY: 0,
          targetX: 8000,
          targetY: 0,
          createdTick: 100,
          expireTick: 130
        }]
      }, { minimumMarginalCoverage: 0 }).existingShotCount === 0
  });
  results.push({
    name: 'combat-shot-coverage-live-single-requires-qualified-improvement-without-history-gate',
    passed: shouldApplyTrajectoryCoverageCore({
      mode: 'live-single',
      highEntropy: true,
      planActive: true,
      hasSelection: true,
      improvementQualified: true
    }) === true
      && shouldApplyTrajectoryCoverageCore({
        mode: 'live-single',
        highEntropy: false,
        dynamicBehaviorEligible: true,
        planActive: true,
        hasSelection: true,
        improvementQualified: true
      }) === true
      && shouldApplyTrajectoryCoverageCore({
        mode: 'live-single',
        highEntropy: false,
        planActive: true,
        hasSelection: true,
        improvementQualified: true
      }) === false
      && shouldApplyTrajectoryCoverageCore({
        mode: 'live-single',
        highEntropy: true,
        successfulAimProtected: true,
        planActive: true,
        hasSelection: true,
        improvementQualified: true
      }) === false
      && shouldApplyTrajectoryCoverageCore({
        mode: 'shadow',
        highEntropy: true,
        planActive: true,
        hasSelection: true,
        improvementQualified: true
      }) === false
      && shouldApplyTrajectoryCoverageCore({
        mode: 'live-single',
        highEntropy: true,
        planActive: true,
        hasSelection: true,
        improvementQualified: false
      }) === false
  });
  results.push({
    name: 'combat-shot-coverage-dynamic-behavior-requires-stable-high-confidence-evidence',
    passed: dynamicBehaviorTrajectoryEligibilityCore({
      mode: 'zigzag-strafe',
      confidence: 0.7,
      metrics: { sampleCount: 8, durationMs: 2500 }
    }) === true
      && dynamicBehaviorTrajectoryEligibilityCore({
        mode: 'retreat-kite',
        confidence: 0.9,
        metrics: { sampleCount: 20, durationMs: 5000 }
      }) === true
      && dynamicBehaviorTrajectoryEligibilityCore({
        mode: 'zigzag-strafe',
        confidence: 0.69,
        metrics: { sampleCount: 20, durationMs: 5000 }
      }) === false
      && dynamicBehaviorTrajectoryEligibilityCore({
        mode: 'retreat-kite',
        confidence: 0.9,
        metrics: { sampleCount: 7, durationMs: 5000 }
      }) === false
      && dynamicBehaviorTrajectoryEligibilityCore({
        mode: 'stationary',
        confidence: 0.95,
        metrics: { sampleCount: 20, durationMs: 5000 }
      }) === false
  });
  results.push({
    name: 'combat-shot-coverage-moving-target-stop-route-is-rejected-only-with-realtime-motion',
    passed: movingTargetStopRouteRejectedCore({
      hypothesis: 'stop',
      moving: true,
      targetSpeed: 50
    }) === true
      && movingTargetStopRouteRejectedCore({
        hypothesis: 'continue',
        moving: true,
        targetSpeed: 50
      }) === false
      && movingTargetStopRouteRejectedCore({
        hypothesis: 'stop',
        moving: false,
        targetSpeed: 50
      }) === false
      && movingTargetStopRouteRejectedCore({
        hypothesis: 'stop',
        moving: true,
        targetSpeed: 2
      }) === false
  });
  const retreatRouteConflict = trajectoryCoverageRouteReliabilityCore({
    mode: 'retreat-kite',
    internalHypothesis: 'right-turn',
    coverageHypothesis: 'continue'
  });
  const retreatRouteAgreement = trajectoryCoverageRouteReliabilityCore({
    mode: 'retreat-kite',
    internalHypothesis: 'continue',
    coverageHypothesis: 'continue'
  });
  const fireAuthorizationBeforeRouteGuard = Object.freeze({
    allowed: true,
    minimumCadenceMs: 400,
    dodgeReserveMilli: 1200
  });
  results.push({
    name: 'combat-shot-coverage-preserves-conflicting-retreat-route',
    passed: retreatRouteConflict.allowCoverageAim === false
      && retreatRouteConflict.reason === 'retreat-route-conflict'
      && retreatRouteAgreement.allowCoverageAim === true
      && shouldApplyTrajectoryCoverageCore({
        mode: 'live-single',
        highEntropy: false,
        dynamicBehaviorEligible: true,
        trajectoryRouteReliable: retreatRouteConflict.allowCoverageAim,
        planActive: true,
        hasSelection: true,
        improvementQualified: true
      }) === false
      && trajectoryCoverageRouteReliabilityCore({
        mode: 'zigzag-strafe',
        internalHypothesis: 'right-turn',
        coverageHypothesis: 'continue'
      }).allowCoverageAim === true
      && fireAuthorizationBeforeRouteGuard.allowed === true
      && fireAuthorizationBeforeRouteGuard.minimumCadenceMs === 400
      && fireAuthorizationBeforeRouteGuard.dodgeReserveMilli === 1200
  });
  const stopGoSamples = Array.from({ length: 32 }, (_, index) => ({
    at: 1000 + index * 50,
    x: 7000 + index * 25,
    y: 0,
    vx: index % 8 < 3 ? 0 : 50,
    vy: 0
  }));
  const arrivalOccupancy = arrivalOccupancyModelCore(stopGoSamples, { flightTicks: 18 });
  const justStartedMoveSamples = stopGoSamples.map((sample, index) => ({
    ...sample,
    vx: index >= 29 ? (index === 31 ? 50 : 0) : sample.vx,
    vy: 0
  }));
  const justStartedMove = arrivalOccupancyModelCore(justStartedMoveSamples, { flightTicks: 18 });
  const irregularMoveSamples = Array.from({ length: 61 }, (_, index) => {
    const moving = (index >= 3 && index < 5)
      || (index >= 8 && index < 20)
      || (index >= 23 && index < 53)
      || index >= 56;
    return {
      at: 1000 + index * 50,
      x: 7000 + index * 25,
      y: 0,
      vx: moving ? 50 : 0,
      vy: 0
    };
  });
  const irregularMove = arrivalOccupancyModelCore(irregularMoveSamples, { flightTicks: 18 });
  const longStopSamples = Array.from({ length: 32 }, (_, index) => ({
    at: 1000 + index * 50,
    x: 7000,
    y: 0,
    vx: index < 8 ? 50 : 0,
    vy: 0
  }));
  const longStop = arrivalOccupancyModelCore(longStopSamples, { flightTicks: 8 });
  results.push({
    name: 'combat-shot-coverage-arrival-occupancy-requires-repeated-stop-go-evidence-and-bounded-dwell',
    passed: arrivalOccupancy.active === true
      && arrivalOccupancy.completedStopRuns >= 3
      && arrivalOccupancy.completedMoveRuns >= 3
      && arrivalOccupancy.restartDirection.vx === 50
      && arrivalOccupancy.remainingStopTicks >= 0
      && justStartedMove.active === false
      && justStartedMove.reason === 'current-move-not-near-transition'
      && irregularMove.active === false
      && longStop.active === false
      && longStop.reason === 'insufficient-stop-go-evidence'
  });
  let switchGate = null;
  const currentTarget = { user_id: 8, hp: 100 };
  const candidateTarget = { user_id: 9, hp: 100 };
  const targetSwitch1 = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget, nowMs: 1000
  }, switchGate);
  switchGate = targetSwitch1.gate;
  const targetSwitch2 = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget, nowMs: 1050
  }, switchGate);
  switchGate = targetSwitch2.gate;
  const targetSwitch3 = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget, nowMs: 1100
  }, switchGate);
  const switchBack = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: currentTarget, nowMs: 1150
  }, targetSwitch2.gate);
  const urgentThreat = {
    targetId: '9', bulletCount: 1, urgentBulletCount: 1, urgent: true,
    riskLevel: 2, minTimeToImpactMs: 700, minDistanceCm: 5000
  };
  const noCurrentThreat = {
    targetId: '8', bulletCount: 0, urgentBulletCount: 0, urgent: false,
    riskLevel: 0, minTimeToImpactMs: null, minDistanceCm: null
  };
  const urgentSwitch1 = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget,
    urgentSafety: true, currentThreat: noCurrentThreat, proposedThreat: urgentThreat, nowMs: 1200
  }, null);
  const urgentSwitch2 = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget,
    urgentSafety: true, currentThreat: noCurrentThreat, proposedThreat: urgentThreat, nowMs: 1250
  }, urgentSwitch1.gate);
  const urgentSwitch3 = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget,
    urgentSafety: true, currentThreat: noCurrentThreat, proposedThreat: urgentThreat, nowMs: 1300
  }, urgentSwitch2.gate);
  const nonSuperiorUrgent = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: candidateTarget,
    urgentSafety: true,
    currentThreat: { ...urgentThreat, targetId: '8', minTimeToImpactMs: 500 },
    proposedThreat: { ...urgentThreat, minTimeToImpactMs: 400 },
    nowMs: 1350
  }, null);
  const missingProposal = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: currentTarget, proposedTarget: null, nowMs: 1400
  }, targetSwitch2.gate);
  const reversalBlocked = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '9',
    currentVisibleTarget: candidateTarget,
    proposedTarget: currentTarget,
    lastSwitch: { fromTargetId: '8', toTargetId: '9', at: 1100 },
    nowMs: 1450
  }, null);
  const urgentReversalBlocked = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '9',
    currentVisibleTarget: candidateTarget,
    proposedTarget: currentTarget,
    urgentSafety: true,
    currentThreat: {
      targetId: '9', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 2, minTimeToImpactMs: 500, minDistanceCm: 5000
    },
    proposedThreat: {
      targetId: '8', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 2, minTimeToImpactMs: 200, minDistanceCm: 5000
    },
    lastSwitch: { fromTargetId: '8', toTargetId: '9', at: 1100 },
    nowMs: 1450
  }, null, { urgentReversalGuardEnabled: true });
  const urgentReversalShadow = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '9',
    currentVisibleTarget: candidateTarget,
    proposedTarget: currentTarget,
    urgentSafety: true,
    currentThreat: {
      targetId: '9', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 2, minTimeToImpactMs: 500, minDistanceCm: 5000
    },
    proposedThreat: {
      targetId: '8', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 2, minTimeToImpactMs: 200, minDistanceCm: 5000
    },
    lastSwitch: { fromTargetId: '8', toTargetId: '9', at: 1100 },
    nowMs: 1450
  }, null, { urgentConfirmTicks: 1 });
  const urgentReversalAllowed = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '9',
    currentVisibleTarget: candidateTarget,
    proposedTarget: currentTarget,
    urgentSafety: true,
    currentThreat: {
      targetId: '9', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 2, minTimeToImpactMs: 900, minDistanceCm: 6000
    },
    proposedThreat: {
      targetId: '8', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 2, minTimeToImpactMs: 200, minDistanceCm: 3000
    },
    lastSwitch: { fromTargetId: '8', toTargetId: '9', at: 1100 },
    nowMs: 1450
  }, null, { urgentConfirmTicks: 1 });
  const invalidCurrent = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: null, proposedTarget: candidateTarget,
    currentInvalid: true, nowMs: 1500
  }, null);
  const threatEvidence = combatTargetIncomingThreatEvidenceCore([
    { ownerId: 8, incoming: true, cpa: 40, distance: 6200, timeToImpact: 1000, remainingTicks: 30 },
    { ownerId: 9, incoming: true, cpa: 50, distance: 3000, timeToImpact: 400, remainingTicks: 30 },
    { ownerId: 9, incoming: true, cpa: 500, distance: 1000, timeToImpact: 100, remainingTicks: 30 }
  ], '9', {
    combatTargetSwitchIncomingDistance: 6500,
    combatTargetSwitchIncomingTimeMs: 900,
    combatBulletHitRadiusCm: 90
  });
  const incomparableThreatMetrics = combatTargetThreatAdvantageCore({
    urgent: true,
    riskLevel: 2,
    minTimeToImpactMs: null,
    minDistanceCm: 5000
  }, {
    urgent: true,
    riskLevel: 2,
    minTimeToImpactMs: 700,
    minDistanceCm: null
  });
  results.push({
    name: 'combat-target-switch-requires-shared-confirmation-and-superior-urgent-threat',
    passed: targetSwitch1.target.user_id === 8
      && targetSwitch2.target.user_id === 8
      && targetSwitch3.target.user_id === 9
      && switchBack.target.user_id === 8
      && switchBack.gate === null
      && urgentSwitch1.target.user_id === 8
      && urgentSwitch2.target.user_id === 8
      && urgentSwitch3.target.user_id === 9
      && urgentSwitch3.diagnostic.reason === 'urgent-incoming-shooter-confirmed'
      && nonSuperiorUrgent.target.user_id === 8
      && nonSuperiorUrgent.diagnostic.reason === 'urgent-incoming-threat-not-superior'
      && missingProposal.target.user_id === 8
      && missingProposal.gate === null
      && reversalBlocked.target.user_id === 9
      && reversalBlocked.diagnostic.reason === 'oscillating-reversal-blocked'
      && urgentReversalBlocked.target.user_id === 9
      && urgentReversalBlocked.diagnostic.reason === 'urgent-oscillating-reversal-blocked'
      && urgentReversalShadow.target.user_id === 8
      && urgentReversalShadow.diagnostic.urgentReversalWouldBlock === true
      && urgentReversalShadow.diagnostic.urgentReversalGuardEnabled === false
      && urgentReversalAllowed.target.user_id === 8
      && urgentReversalAllowed.diagnostic.urgentReversalAdvantage === true
      && invalidCurrent.target.user_id === 9
      && invalidCurrent.diagnostic.reason === 'current-target-invalid'
      && threatEvidence.bulletCount === 1
      && threatEvidence.urgentBulletCount === 1
      && threatEvidence.riskLevel === 3
      && incomparableThreatMetrics.significant === false
      && incomparableThreatMetrics.timeToImpactAdvantageMs === null
      && incomparableThreatMetrics.distanceAdvantageCm === null
  });

  // A close shooter's bullet can impact in fewer frames than the urgent
  // confirmation window spans. The 2026-09-01 00:06 fight proposed the same
  // urgent switch four times at TTI 9-83ms and never passed a 3-tick gate,
  // because each bullet stayed dangerous for only 1-2 frames. The requirement
  // now scales to the frames actually available while the superiority test and
  // the reversal guard stay in force.
  const nearThreatCurrent = { user_id: 8, name: 'far-harasser' };
  const nearThreatCandidate = { user_id: 9, name: 'close-shooter' };
  const noThreatCurrentSide = {
    targetId: '8', bulletCount: 0, urgentBulletCount: 0, urgent: false,
    riskLevel: 0, minTimeToImpactMs: null, minDistanceCm: null
  };
  const imminentThreat = {
    targetId: '9', bulletCount: 1, urgentBulletCount: 1, urgent: true,
    riskLevel: 3, minTimeToImpactMs: 9, minDistanceCm: 92
  };
  const imminentUrgentSwitch = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: nearThreatCurrent, proposedTarget: nearThreatCandidate,
    urgentSafety: true, currentThreat: noThreatCurrentSide, proposedThreat: imminentThreat, nowMs: 2000
  }, null);
  // 83ms at a 50ms control interval leaves one usable frame, so a single
  // observation is enough; 180ms leaves three and keeps the full window.
  const shortWindowThreat = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: nearThreatCurrent, proposedTarget: nearThreatCandidate,
    urgentSafety: true,
    currentThreat: noThreatCurrentSide,
    proposedThreat: { ...imminentThreat, minTimeToImpactMs: 83 },
    nowMs: 2050
  }, null);
  const unscaledUrgentFirstTick = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: nearThreatCurrent, proposedTarget: nearThreatCandidate,
    urgentSafety: true,
    currentThreat: noThreatCurrentSide,
    proposedThreat: { ...imminentThreat, minTimeToImpactMs: 180 },
    nowMs: 2100
  }, null);
  // Scaling must not defeat the oscillation reversal guard when it is enabled.
  // The proposed side needs a genuinely superior threat to clear the
  // superiority test first, so it carries the higher risk level here; the
  // reversal guard is what must still refuse the switch.
  const imminentReversalStillBlocked = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '9',
    currentVisibleTarget: nearThreatCandidate,
    proposedTarget: nearThreatCurrent,
    urgentSafety: true,
    currentThreat: {
      targetId: '9', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 3, minTimeToImpactMs: 400, minDistanceCm: 900
    },
    proposedThreat: {
      targetId: '8', bulletCount: 1, urgentBulletCount: 1, urgent: true,
      riskLevel: 3, minTimeToImpactMs: 100, minDistanceCm: 800
    },
    lastSwitch: { fromTargetId: '8', toTargetId: '9', at: 2100 },
    nowMs: 2150
  }, null, { urgentReversalGuardEnabled: true });
  // An ordinary (non-urgent) switch never scales, and a missing TTI keeps the
  // base window rather than collapsing to a single frame.
  const ordinaryNeverScales = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: nearThreatCurrent, proposedTarget: nearThreatCandidate,
    urgentSafety: false,
    currentThreat: noThreatCurrentSide,
    proposedThreat: { ...imminentThreat, minTimeToImpactMs: 9 },
    nowMs: 2200
  }, null);
  const missingTtiKeepsBaseWindow = applyCombatTargetSwitchHysteresisCore({
    currentTargetId: '8', currentVisibleTarget: nearThreatCurrent, proposedTarget: nearThreatCandidate,
    urgentSafety: true,
    currentThreat: noThreatCurrentSide,
    proposedThreat: { ...imminentThreat, minTimeToImpactMs: null },
    nowMs: 2250
  }, null);
  results.push({
    name: 'urgent-combat-target-switch-confirmation-scales-to-available-impact-frames',
    passed: imminentUrgentSwitch.target.user_id === 9
      && imminentUrgentSwitch.diagnostic.allowed === true
      && imminentUrgentSwitch.diagnostic.reason === 'urgent-incoming-shooter-confirmed'
      && imminentUrgentSwitch.diagnostic.confirmationTicks === 1
      && imminentUrgentSwitch.diagnostic.baseConfirmationTicks === 3
      && imminentUrgentSwitch.diagnostic.urgentConfirmationScaled === true
      && imminentUrgentSwitch.diagnostic.ttiAvailableTicks === 1
      && imminentUrgentSwitch.gate === null
      && shortWindowThreat.target.user_id === 9
      && shortWindowThreat.diagnostic.confirmationTicks === 1
      && shortWindowThreat.diagnostic.urgentConfirmationScaled === true
      && unscaledUrgentFirstTick.target.user_id === 8
      && unscaledUrgentFirstTick.diagnostic.allowed === false
      && unscaledUrgentFirstTick.diagnostic.confirmationTicks === 3
      && unscaledUrgentFirstTick.diagnostic.urgentConfirmationScaled === false
      && imminentReversalStillBlocked.target.user_id === 9
      && imminentReversalStillBlocked.diagnostic.reason === 'urgent-oscillating-reversal-blocked'
      && ordinaryNeverScales.target.user_id === 8
      && ordinaryNeverScales.diagnostic.allowed === false
      && ordinaryNeverScales.diagnostic.confirmationTicks === 3
      && ordinaryNeverScales.diagnostic.urgentConfirmationScaled === false
      && ordinaryNeverScales.diagnostic.ttiAvailableTicks === null
      && missingTtiKeepsBaseWindow.target.user_id === 8
      && missingTtiKeepsBaseWindow.diagnostic.confirmationTicks === 3
      && missingTtiKeepsBaseWindow.diagnostic.urgentConfirmationScaled === false
  });

  const evasiveBehavior = {
    mode: 'zigzag-strafe',
    confidence: 0.82,
    metrics: {
      sampleCount: 14,
      durationMs: 3200,
      movementTransitions: { transitionCount: 7, conditionalSampleCount: 10 }
    }
  };
  const ordinaryTurn = {
    mode: 'zigzag-strafe',
    confidence: 0.82,
    metrics: {
      sampleCount: 5,
      durationMs: 700,
      movementTransitions: { transitionCount: 2, conditionalSampleCount: 1 }
    }
  };
  const earlyExperiment = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-a',
    engagementGeneration: 'engagement-a',
    startedAt: 1000,
    startedTick: 10,
    nowMs: 4200,
    evaluationWindowMs: 28800,
    acceptedShots: 20,
    confirmedHits: 0,
    behavior: evasiveBehavior
  }, { triggerEnabled: true, randomUnit: 0.42 });
  const lockedExperiment = updateEvasiveAimExperimentCore(earlyExperiment, {
    targetId: 'target-a',
    engagementGeneration: 'engagement-a',
    startedAt: 1000,
    startedTick: 10,
    nowMs: 9000,
    evaluationWindowMs: 28800,
    acceptedShots: 31,
    confirmedHits: 3,
    behavior: ordinaryTurn
  }, { triggerEnabled: true, randomUnit: 0.99 });
  const nextEngagementExperiment = updateEvasiveAimExperimentCore(earlyExperiment, {
    targetId: 'target-a',
    engagementGeneration: 'engagement-a-reconnected',
    startedAt: 9000,
    startedTick: 200,
    nowMs: 9200,
    evaluationWindowMs: 28800,
    acceptedShots: 0,
    confirmedHits: 0,
    behavior: ordinaryTurn
  }, { triggerEnabled: true, randomUnit: 0.99 });
  const halfWindowPass = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-b',
    engagementGeneration: 'engagement-b',
    startedAt: 1000,
    startedTick: 20,
    nowMs: 15400,
    evaluationWindowMs: 28800,
    acceptedShots: 20,
    confirmedHits: 2,
    behavior: ordinaryTurn
  }, { triggerEnabled: true, randomUnit: 0.01 });
  const halfWindowFail = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-c',
    engagementGeneration: 'engagement-c',
    startedAt: 1000,
    startedTick: 30,
    nowMs: 15400,
    evaluationWindowMs: 28800,
    acceptedShots: 20,
    confirmedHits: 1,
    behavior: ordinaryTurn
  }, { triggerEnabled: true, randomUnit: 0.99 });
  results.push({
    name: 'evasive-aim-experiment-detects-only-sustained-evasion-and-locks-one-random-strategy',
    passed: highConfidenceEvasiveBehaviorCore(evasiveBehavior).eligible === true
      && highConfidenceEvasiveBehaviorCore(ordinaryTurn).eligible === false
      && earlyExperiment.active === true
      && earlyExperiment.strategy === EVASIVE_AIM_STRATEGIES[2]
      && earlyExperiment.triggerReason === 'strict-evasive-zero-hit-zigzag-strafe'
      && earlyExperiment.acceptedShotsAtTrigger === 20
      && lockedExperiment.strategy === earlyExperiment.strategy
      && lockedExperiment.triggeredAt === earlyExperiment.triggeredAt
      && nextEngagementExperiment.active === false
      && nextEngagementExperiment.strategy === ''
      && nextEngagementExperiment.engagementGeneration === 'engagement-a-reconnected'
      && halfWindowPass.active === false
      && halfWindowPass.halfWindowEvaluated === true
      && halfWindowPass.requiredConfirmedHits === 2
      && halfWindowFail.active === true
      && halfWindowFail.strategy === EVASIVE_AIM_STRATEGIES[4]
      && halfWindowFail.triggerReason === 'half-efficiency-window-hit-shortfall'
  });

  const earlyDetectionDisabled = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-d',
    engagementGeneration: 'engagement-d',
    startedAt: 1000,
    nowMs: 4200,
    evaluationWindowMs: 28800,
    acceptedShots: 20,
    confirmedHits: 0,
    behavior: evasiveBehavior
  }, { triggerEnabled: true, earlyDetectionEnabled: false, randomUnit: 0.2 });
  const disabledExperiment = updateEvasiveAimExperimentCore(earlyExperiment, {
    targetId: 'target-a',
    engagementGeneration: 'engagement-a',
    startedAt: 1000,
    nowMs: 5000,
    evaluationWindowMs: 28800,
    acceptedShots: 21,
    confirmedHits: 0,
    behavior: evasiveBehavior
  }, { triggerEnabled: true, enabled: false, randomUnit: 0.8 });
  results.push({
    name: 'evasive-aim-rollbacks-disable-early-detection-or-the-whole-experiment',
    passed: earlyDetectionDisabled.active === false
      && earlyDetectionDisabled.earlyDetectionEnabled === false
      && disabledExperiment.enabled === false
      && disabledExperiment.active === false
      && disabledExperiment.strategy === ''
  });

  const triggerDisabledEarly = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-e',
    engagementGeneration: 'engagement-e',
    startedAt: 1000,
    startedTick: 50,
    nowMs: 4200,
    evaluationWindowMs: 28800,
    acceptedShots: 25,
    confirmedHits: 0,
    behavior: evasiveBehavior
  }, { triggerEnabled: false, randomUnit: 0.5 });
  const triggerDisabledHalf = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-f',
    engagementGeneration: 'engagement-f',
    startedAt: 1000,
    startedTick: 60,
    nowMs: 15400,
    evaluationWindowMs: 28800,
    acceptedShots: 20,
    confirmedHits: 0,
    behavior: evasiveBehavior
  }, { triggerEnabled: false, randomUnit: 0.5 });
  const triggerDefaultNoOption = updateEvasiveAimExperimentCore(null, {
    targetId: 'target-g',
    engagementGeneration: 'engagement-g',
    startedAt: 1000,
    startedTick: 70,
    nowMs: 4200,
    evaluationWindowMs: 28800,
    acceptedShots: 25,
    confirmedHits: 0,
    behavior: evasiveBehavior
  }, { randomUnit: 0.5 });
  results.push({
    name: 'evasive-aim-trigger-disabled-by-default-never-activates',
    passed: triggerDisabledEarly.enabled === true
      && triggerDisabledEarly.triggerEnabled === false
      && triggerDisabledEarly.active === false
      && triggerDisabledEarly.strategy === ''
      && triggerDisabledEarly.triggerReason === ''
      && triggerDisabledHalf.enabled === true
      && triggerDisabledHalf.triggerEnabled === false
      && triggerDisabledHalf.active === false
      && triggerDisabledHalf.halfWindowEvaluated === true
      && triggerDefaultNoOption.enabled === true
      && triggerDefaultNoOption.triggerEnabled === false
      && triggerDefaultNoOption.active === false
  });

  const modelMotionSamples = [];
  for (let tick = 70; tick <= 100; tick += 1) {
    const phase = Math.floor((tick - 70) / 4) % 4;
    const directions = [[50, 0], [0, 50], [-50, 0], [0, -50]];
    const [vx, vy] = directions[phase];
    modelMotionSamples.push({
      tick,
      at: tick * 50,
      x: 4000 + (tick - 70) * vx,
      y: 1200 + (tick - 70) * vy,
      vx,
      vy,
      selfX: 0,
      selfY: 0,
      selfVx: 0,
      selfVy: 0
    });
  }
  const modelPredictions = predictEvasiveAimAngles(EVASIVE_AIM_TEST_MODEL, {
    motionSamples: modelMotionSamples,
    observedTick: 100,
    executionDelayTicks: 5,
    flightTicks: 9,
    targetVelocity: { vx: 0, vy: -50 },
    shooterVelocity: { vx: 0, vy: 0 },
    predictedShooterOrigin: { x: 0, y: 0 },
    predictedTargetAtCreation: { x: 4000, y: 950 }
  });
  const interpolatedKnnFeatures = buildKnnFeatures({
    motionSamples: [
      { tick: 98, x: 3900, y: 900, vx: 50, vy: 0 },
      { tick: 100, x: 4000, y: 1000, vx: 0, vy: 50 }
    ],
    observedTick: 100,
    flightTicks: 9,
    predictedShooterOrigin: { x: 0, y: 0 },
    predictedTargetAtCreation: { x: 4000, y: 1000 }
  });
  const appliedAngles = EVASIVE_AIM_STRATEGIES.map((strategy, index) => applyEvasiveAimStrategyCore(
    { x: 4500, y: 950 },
    {
      active: true,
      strategy,
      triggerReason: 'test',
      modelVersion: EVASIVE_AIM_TEST_MODEL.modelVersion,
      acceptedShotsAtTrigger: index === 3 ? 7 : 0
    },
    modelPredictions,
    {
      baselineAim: { x: 4500, y: 950 },
      predictedShooterOrigin: { x: 0, y: 0 },
      predictedTargetAtCreation: { x: 4000, y: 950 },
      acceptedShots: index === 3 ? 7 : 0
    }
  ));
  const outsideTrainingRange = applyEvasiveAimStrategyCore(
    { x: 6500, y: 0 },
    { active: true, strategy: 'gaussian-linear' },
    modelPredictions,
    {
      baselineAim: { x: 6500, y: 0 },
      predictedShooterOrigin: { x: 0, y: 0 },
      predictedTargetAtCreation: { x: 6000, y: 0 },
      acceptedShots: 0
    }
  );
  results.push({
    name: 'evasive-aim-five-models-produce-bounded-offsets-and-fall-back-outside-training-range',
    passed: modelPredictions.ok === true
      && appliedAngles.every(item => item.applied === true && Math.abs(item.offsetDeg) <= 8)
      && appliedAngles[0].offsetDeg === modelPredictions.linearAngleDeg
      && appliedAngles[1].offsetDeg === modelPredictions.knnAngleDeg
      && appliedAngles[2].offsetDeg === modelPredictions.fusionAngleDeg
      && appliedAngles[3].offsetDeg === modelPredictions.fusionAngleDeg
      && appliedAngles[4].offsetDeg === modelPredictions.routerAngleDeg
      && interpolatedKnnFeatures.length === 10
      && Math.abs(interpolatedKnnFeatures[2] - interpolatedKnnFeatures[4]) < 1e-9
      && Math.abs(interpolatedKnnFeatures[3] - interpolatedKnnFeatures[5]) < 1e-9
      && outsideTrainingRange.applied === false
      && outsideTrainingRange.reason === 'outside-trained-distance'
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
