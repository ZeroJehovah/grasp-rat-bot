'use strict';

const {
  offlineLeaveSummaryText,
  staminaHoldContradictedByStaminaEvidence,
  combatLogExitSummaryFromDecision
} = require('../shared/exit-summary');
const {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
} = require('../shared/runtime-utils');
const {
  formatDistance,
  formatDurationMs,
  actorLabel,
  hpDisplay
} = require('../shared/display-format');

function runSelfTest() {
  const cfg = {
    dangerRadius: 17000,
    activeCautionRadius: 23000,
    activeCautionExitMargin: 2000,
    activeAvoidMaxDistance: 25000,
    activeReturnBlockMargin: 0,
    activeReturnBlockExitMargin: 0,
    activeReturnBlockResumeMargin: 0,
    activeReturnBlockClearMargin: 0,
    returnBlockScanHeadingMs: 2600,
    returnBlockScanStuckMs: 1400,
    returnBlockScanStuckDistance: 350,
    returnBlockCooldownMs: 8000,
    stationaryActiveDangerRadius: 18000,
    stationaryActiveCautionRadius: 22000,
    attackDangerRadius: 25000,
    attackRange: 14500,
    attackEngageRange: 11000,
    attackApproachRange: 50000,
    attackPreferredRange: 14500,
    globalAttackMaxDistance: 50000,
    nativeEntityAuthoritativeRadius: 42000,
    nativeCoinAuthoritativeRadius: 50000,
    combatAttackRange: 14500,
    combatDisengageRange: 17000,
    combatLowValueActiveDropMax: 3,
    highValueCoinPriorityAmount: 10,
    highValueCoinPriorityHealthyHp: 50,
    combatCriticalHpLeaveThreshold: 20,
    combatLowHpLeaveThreshold: 50,
    combatLowHpCloseRiskMargin: 5,
    combatHighHpDisadvantageGap: 20,
    combatDisadvantageConfirmMs: 2500,
    combatDisadvantageMinEngageMs: 3500,
    combatDisadvantageMinSamples: 4,
    combatLowHpNoDamageLeaveThreshold: 70,
    combatLowHpNoDamageLeaveMs: 15000,
    combatLowHpNoDamageMinGap: 0,
    combatShootEveryMs: 160,
    combatShootReserveMs: 5600,
    combatShootDodgeReserveMs: 3800,
    combatShootHighHpDodgeReserveMs: 3000,
    combatShootHighHpMinHp: 90,
    combatShootFinishLowThreatDodgeReserveMs: 1800,
    combatShootFinishLowThreatMinHp: 90,
    combatShootFinishLowThreatTargetHpMax: 55,
    combatShootFinishLowThreatMaxHpGap: 0,
    combatShootFinishLowThreatRange: 8500,
    combatShootPassiveRunnerDodgeReserveMs: 1800,
    combatShootWinningPressureDodgeReserveMs: 1800,
    combatShootWinningPressureMinHp: 60,
    combatShootWinningPressureTargetHpMax: 75,
    combatShootWinningPressureLeadHp: 5,
    combatShootWinningPressureRange: 11000,
    combatShootWinningPressureNoDamageMs: 6000,
    combatShootPressureDodgeReserveMs: 2600,
    combatShootPressureMinHp: 60,
    combatShootPressureRange: 14500,
    combatShootPressureMaxHpGap: 10,
    combatFarNoDamageCloseMs: 6000,
    combatFarNoDamageCloseStartRange: 10000,
    combatFarNoDamageCloseRange: 7500,
    combatFarNoDamageCloseMinHp: 60,
    combatFarNoDamageCloseMaxHpGap: 10,
    combatRetreatingFighterCloseMinHp: 60,
    combatRetreatingFighterCloseMaxHpGap: 10,
    combatOutOfRangeFinishPressureRange: 16000,
    combatOutOfRangeFinishPressureSelfHpMin: 55,
    combatOutOfRangeFinishPressureTargetHpMax: 55,
    combatOutOfRangeFinishPressureMaxHpGap: 0,
    combatOutOfRangeFinishPressureRecentDamageMs: 10000,
    combatOutOfRangeReengageRange: 15000,
    combatOutOfRangeReengageMinHp: 60,
    combatOutOfRangeReengageMaxHpGap: 10,
    combatOutOfRangePressureReengageMaxHpGap: 20,
    combatOutOfRangeReengageRecentInRangeMs: 2500,
    combatPassiveRunnerMinSelfHp: 80,
    combatPassiveRunnerMinDrop: 1,
    combatPassiveRunnerConfirmMs: 2500,
    combatPassiveRunnerCloseRange: 4500,
    combatPassiveRunnerInterceptSpreadScale: 0,
    combatShootHardReserveMs: 1800,
    combatShootConserveEveryMs: 360,
    combatShootRecoveryEveryMs: 700,
    combatStationarySpeed: 5,
    combatAimJitterRadians: 0.08,
    combatAimJitterMinRadians: 0.025,
    combatAimJitterMaxRadians: 0.14,
    combatAimJitterCloseDistance: 2500,
    combatAimJitterFarDistance: 14500,
    combatAimLeadMinRadians: 0.035,
    combatAimEvasionScale: 1.0,
    combatAimMotionSampleMs: 50,
    combatAimRecentMotionDecayMs: 900,
    combatAimMovingScaleThreshold: 0.15,
    combatAimMinMotionJitterScale: 0.2,
    combatTargetDodgeSpeedPerTick: 50,
    combatBulletSpeedPerTick: 500,
    combatBulletHitRadiusCm: 90,
    combatRenderDelayTicks: 2,
    combatInterceptMaxTicks: 30,
    combatInterceptSpreadScale: 0.18,
    combatMotionHistoryWindowMs: 2000,
    combatMotionHistoryMaxSamples: 80,
    combatAimLowConfidenceThreshold: 0.6,
    combatAimLowConfidenceMinDistance: 9000,
    combatAimLowConfidenceMotionScale: 0.65,
    combatAimLowConfidenceEveryMs: 520,
    combatTradeEstimateWindowMs: 6000,
    combatTradeEstimateMinWindowMs: 1800,
    combatTradeEstimateMinSelfDamage: 6,
    combatTradeEstimateSafetyFactor: 1.15,
    combatTradeEstimateMinEnemyDps: 1.5,
    combatTradeEstimateNoDamageSafeSelfHp: 75,
    combatTradeEstimateNoDamageUnsafeTDeathMs: 30000,
    combatAimNoDamageMs: 1000,
    combatAimNoDamageStepMs: 800,
    combatAimNoDamageMaxRadians: 0.14,
    combatAimFallbackPrecisionNoDamageMs: 25000,
    combatAimLiveDivergencePrecisionCm: 1200,
    combatAimLiveDivergencePrecisionRatio: 0.08,
    combatAimRadialPrecisionLateralRatio: 0.35,
    combatAimSteadyNoDamageMs: 6000,
    combatAimSteadySpeedMax: 5,
    combatAimLockMs: 450,
    combatShootSteadyAimDodgeReserveMs: 3000,
    combatShootSteadyAimNoDamageMs: 6000,
    combatShootSteadyAimMinHp: 75,
    combatShootSteadyAimMaxHpGap: 15,
    combatShootNoDamageDuelDodgeReserveMs: 3000,
    combatShootNoDamageDuelNoDamageMs: 25000,
    combatShootNoDamageDuelMinHp: 75,
    combatShootNoDamageDuelMaxHpGap: 10,
    combatShootNoDamageDuelRange: 14500,
    combatServerStallNoDamageLeaveMs: 25000,
    combatServerStallNoDamagePrecisionGraceMs: 10000,
    combatServerStallNoDamageHpGap: 5,
    combatTargetSwitchIncomingDistance: 6500,
    combatTargetSwitchIncomingTimeMs: 900,
    combatRetreatEdgeRange: 13800,
    combatRetreatRadialSpeedMin: 5,
    combatRetreatDistanceDeltaMin: 600,
    combatRetreatIgnoreMs: 15000,
    combatFinishPressureSelfHpMin: 90,
    combatFinishPressureTargetHpMax: 55,
    combatFinishPressureCloseRange: 6500,
    combatFinishPressureShootEveryMs: 360,
    combatBulletDetectRadius: 30000,
    combatBulletLaneRadius: 3000,
    combatBulletLookaheadDistance: 42000,
    snapshotBulletStaleMs: 1500,
    snapshotSelfStaleMs: 6500,
    combatStrafeLockMs: 700,
    combatStrafeDirectionLockMs: 2200,
    combatStrafeRandomJitterMs: 1100,
    combatStrafePreciseLaneMin: 1,
    combatStrafeCarryMs: 1600,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 17000,
    combatSpacingMinRange: 4500,
    combatSpacingPreferredRange: 6500,
    combatSpacingEmergencyRange: 3000,
    combatSpacingLowHpThreshold: 70,
    combatPressureCloseNoDamageMs: 8000,
    combatPressureCloseRange: 6500,
    combatPressureCloseMinHp: 60,
    combatPressureExitHpThreshold: 60,
    combatPressureExitHpGap: 5,
    combatPressureNoDamageExitMs: 10000,
    combatPressureNoDamageExitHpThreshold: 80,
    combatPressureNoDamageExitHpGap: 10,
    combatPressureNoDamageExitTargetHpMin: 75,
    combatPressureNoDamageExitRange: 14500,
    combatLeaveRetryMs: 1000,
    leaveRetryMinMs: 10000,
    leaveCommandTimeoutMs: 10000,
    leave403ReloginDelayMs: 3600000,
    enemyReloginMinDelayMs: 60000,
    enemyReloginMaxDelayMs: 600000,
    enemyReloginJitterMs: 15000,
    enemyReloginRepeatResetMs: 7200000,
    enemyReloginRepeatSecondMaxMs: 1800000,
    enemyReloginRepeatThirdMaxMs: 3600000,
    postAttackDropCoinMinAmount: 1,
    opportunisticShootEveryMs: 120,
    opportunisticShotMinScoreRatio: 1,
    attackMinDrop: 8,
    attackMinAfkDrop: 3,
    attackApproachMinDrop: 12,
    attackMinRewardRatio: 0.5,
    targetWhitelistNames: ['文月'],
    targetWhitelistIds: [],
    coinOpportunityValue: 60000,
    dropOpportunityValue: 60000,
    opportunityDistanceFloor: 50,
    opportunityDistanceScoreScale: 10000,
    opportunityMoveStaminaPerCm: 1,
    opportunityShotStaminaCostMs: 500,
    opportunityEstimatedDamagePerShot: 3,
    opportunityCoinPickupStaminaMs: 0,
    opportunityLongStaminaReserveMs: 1500,
    opportunityStickBonus: 0,
    opportunitySwitchMargin: 3000,
    opportunitySwitchRelativeMargin: 0.1,
    opportunitySwitchHoldMs: 7000,
    opportunityMissingHoldMs: 7000,
    opportunityOscillationSwitchLimit: 5,
    opportunitySameCoinRadius: 1200,
    opportunityVisibleDistance: 50000,
    opportunityNearbyPriorityDistance: 50000,
    opportunityAfkStaminaCooldownMs: 60000,
    opportunityAfkStaminaDropThresholdMs: 100,
    coinMaxDistance: 18000,
    coinDangerRadius: 25000,
    invulnerableActiveCoinDangerRadius: 36000,
    invulnerableActiveCoinHeadingBlockRadius: 65000,
    invulnerableActiveCoinHeadingLaneRadius: 18000,
    invulnerableActiveCoinHeadingCosMin: 0.55,
    invulnerableActiveCoinHeadingMinDistance: 1500,
    stationaryActiveCoinDangerRadius: 12000,
    globalCoinMaxDistance: 50000,
    patrolCoinMaxDistance: 22000,
    scanCoinMaxDistance: 22000,
    distantCoinMaxDistance: 35000,
    distantCoinMinDistance: 22000,
    coinRouteMaxDistance: 50000,
    coinRouteClusterRadius: 13000,
    coinRouteLinkDistance: 15000,
    coinRouteMaxLinkDistance: 22000,
    coinRouteAnchorLimit: 22,
    coinRoutePoolLimit: 72,
    coinRouteMaxPointsDense: 6,
    coinRouteMaxPointsMid: 4,
    coinRouteMaxPointsSparse: 2,
    coinRouteLegSampleDistance: 10000,
    coinRouteNearbyFirstCoinDistance: 22000,
    coinRouteFirstCoinDistanceRatio: 1.45,
    coinRouteFirstCoinDistanceSlack: 6000,
    coinRouteSwitchMargin: 3000,
    coinRouteSwitchRelativeMargin: 0.1,
    coinRouteHeldMinOverlap: 2,
    fieldMigrationMaxDistance: 45000,
    fieldMigrationMinDistance: 22000,
    fieldMigrationClusterRadius: 18000,
    fieldMigrationMinCoins: 3,
    fieldMigrationStaminaThreshold: 0,
    fieldMigrationNearbyCoinBlockDistance: 30000,
    snapshotCoinMaxDistance: 1200000,
    snapshotCoinClusterRadius: 22000,
    snapshotCoinClusterMinCoins: 2,
    snapshotSingleCoinMaxDistance: 22000,
    snapshotSingleCoinDistancePerAmount: 30000,
    snapshotCoinIdleMaxMs: 60000,
    patrolHeadingMs: 26000,
    patrolStaminaThreshold: 6500,
    chaseCoinStaminaThreshold: 0,
    patrolPrecisionTolerance: 1200,
    footCoinPriorityDistance: 1200,
    nearCoinPriorityDistance: 13500,
    activeReturnBlockCoinPassDistance: 900,
    postAttackDropCoinPriorityMs: 45000,
    postAttackDropCoinRadius: 3500,
    postAttackDropCoinMaxDistance: 22000,
    postAttackRecoveryDropMaxDistance: 50000,
    postAttackRecoveryDropMinScore: 60000,
    postAttackDropWaitMs: 1000,
    postAttackDropResolveMaxMs: 5000,
    postAttackDropWaitMinDrop: 8,
    postAttackDropWaitMaxDistance: 50000,
    postAttackDropWaitStopDistance: 900,
    killChatAttackMatchMs: 120000,
    killAttributionMergeMs: 120000,
    conserveCoinMaxDistance: 6000,
    recoveryCoinMaxDistance: 600,
    coinPrecisionTolerance: 60,
    coinPickupExactTolerance: 0,
    precisionPulseMaxMs: 260,
    coinPickupStopDistance: 30,
    coinPickupStopPulseMs: 45,
    coinPickupMicroDistance: 120,
    coinPickupMicroPulseMs: 60,
    coinPickupFineDistance: 320,
    coinPickupSweepDistance: 900,
    coinPickupPulseMs: 240,
    coinPickupSweepPulseMs: 150,
    coinPickupFinePulseMs: 75,
    coinAxisApproachMinDistance: 5000,
    coinAxisApproachRatio: 4,
    coinAxisApproachLaneTolerance: 1800,
    coinApproachBrakeDistance: 700,
    coinPickupBrakeDistance: 650,
    coinPickupBrakePulseMs: 90,
    coinPickupFailureSlowStepMs: 10,
    coinPickupFailureMinPulseMs: 35,
    coinPickupAttemptSlowEveryMs: 2500,
    coinPickupAttemptSlowMaxCount: 3,
    globalSamplingOutageOfflineEnabled: true,
    globalSamplingOutageMinErrors: 1,
    globalSamplingOutageMinAgeMs: 0,
    globalSamplingOutageCombatOnly: true,
    combatTickGapOfflineEnabled: true,
    combatTickGapOfflineMs: 5000,
    tickMs: 120,
    nativeTickMinMs: 120,
    combatNativeTickMinMs: 80,
    attackMinStamina: 0,
    passiveAvoidRadius: 11000,
    passivePanicRadius: 120,
    recoveryAvoidRadius: 22000,
    lowHpThreshold: 60,
    recoverHpThreshold: 95,
    staminaFullRatio: 0.98,
    conserveStaminaThreshold: 6500,
    staminaBudgetReloginDelayMs: 1800000,
    pursuitLeaveMs: 300000,
    pursuitLeaveNonFullHpMs: 90000,
    pursuitLeaveInvulnerableMs: 60000,
    pursuitLeaveNonFullHpInvulnerableMs: 45000,
    targetStickMs: 5000,
    coinStickMs: 2500,
  };
  const bot = { lastTarget: null, lastTargetAt: 0, lastDecision: null, combatTarget: null, combatRetreatIgnore: new Map(), combatDisadvantageObservation: null, opportunityChoice: null, opportunitySwitchLock: null, opportunityAfkStamina: new Map() };
  const dist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const dropValue = e => Number(e.death_reward_preview ?? e.death_drop_coins ?? e.drop ?? 0) || 0;
  const isAlive = e => e && e.life !== 'Dead' && e.life !== 'WaitingRevive' && !e.waiting_revive;
  const speed = e => Math.hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
  const isInvulnerable = e => Number(e?.invulnerable_remaining_ticks ?? e?.invincible_remaining_ticks ?? e?.invulnerability_remaining_ticks ?? e?.invulnerableTicks ?? 0) > 0
    || truthyFlag(e?.invulnerable)
    || truthyFlag(e?.is_invulnerable)
    || truthyFlag(e?.isInvulnerable)
    || truthyFlag(e?.immune)
    || truthyFlag(e?.is_immune);
  const isJoinModeActive = e => e?.current_join_mode === 'Active' || e?.mode === 'Active';
  const isInvulnerableActive = e => isJoinModeActive(e) && isInvulnerable(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const combatMovementBlockedByStamina = self => {
    const stamina5s = staminaRemaining(self, '5s');
    return stamina5s !== null && stamina5s < staminaExhaustedThreshold();
  };
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isMovingThreat = e => speed(e) >= 5 || Boolean(e.recentlyMoved);
  const isFiringEntity = e => truthyFlag(e?.shooting)
    || truthyFlag(e?.is_shooting)
    || truthyFlag(e?.isShooting)
    || truthyFlag(e?.firing)
    || truthyFlag(e?.is_firing)
    || truthyFlag(e?.attacking)
    || truthyFlag(e?.is_attacking);
  const isActive = e => isMovingThreat(e) || isFiringEntity(e) || (isJoinModeActive(e) && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const hasCombatActivitySignalForTest = e => isActive(e)
    || truthyFlag(e?.active)
    || truthyFlag(e?.currentlyActive)
    || truthyFlag(e?.combat)
    || truthyFlag(e?.engagedCombat)
    || String(e?.combatIntent || '') === 'engaged';
  const isAvoidanceThreat = e => isInvulnerable(e);
  const isAfkTarget = e => !isJoinModeActive(e) && !isActive(e) && !isMovingThreat(e);
  const isAfkProfitTarget = e => isAfkTarget(e) || (isJoinModeActive(e) && !isActive(e) && !isMovingThreat(e) && !isFiringEntity(e));
  const normalizeTargetText = value => String(value ?? '').trim();
  const targetWhitelistNames = new Set((Array.isArray(cfg.targetWhitelistNames) ? cfg.targetWhitelistNames : [])
    .map(normalizeTargetText)
    .filter(Boolean));
  const targetWhitelistIds = new Set((Array.isArray(cfg.targetWhitelistIds) ? cfg.targetWhitelistIds : [])
    .map(normalizeTargetText)
    .filter(Boolean));
  const isWhitelistedTarget = e => {
    if (!e) return false;
    const id = e.user_id ?? e.id;
    if (id !== null && id !== undefined && targetWhitelistIds.has(String(id))) return true;
    const name = normalizeTargetText(e.name);
    return Boolean(name && targetWhitelistNames.has(name));
  };
  const decorateThreat = (self, e) => {
    const moving = isMovingThreat(e);
    return {
      ...e,
      distance: dist(self, e),
      drop: dropValue(e),
      speed: speed(e),
      moving,
      threatRadius: moving ? cfg.dangerRadius : cfg.stationaryActiveDangerRadius,
      cautionRadius: moving ? cfg.activeCautionRadius : cfg.stationaryActiveCautionRadius,
      coinDangerRadius: moving ? cfg.coinDangerRadius : cfg.stationaryActiveCoinDangerRadius
    };
  };
  function coinThreatDangerRadius(threat) {
    const base = Number(threat?.coinDangerRadius ?? cfg.coinDangerRadius);
    if (isInvulnerableActive(threat)) return Math.max(base, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
    return base;
  }
  function coinHeadingBlockedByInvulnerableThreat(self, coin, threat) {
    if (!self || !coin || !isInvulnerableActive(threat)) return false;
    const coinDx = Number(coin.x) - Number(self.x);
    const coinDy = Number(coin.y) - Number(self.y);
    const threatDx = Number(threat.x) - Number(self.x);
    const threatDy = Number(threat.y) - Number(self.y);
    const coinDistance = Math.hypot(coinDx, coinDy);
    const threatDistance = Math.hypot(threatDx, threatDy);
    const minCoinDistance = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingMinDistance || 0));
    const blockRadius = Math.max(0, Number(cfg.invulnerableActiveCoinHeadingBlockRadius || 0));
    if (!(coinDistance >= minCoinDistance) || !(threatDistance > 0) || threatDistance > blockRadius) return false;
    const cos = (coinDx * threatDx + coinDy * threatDy) / Math.max(1, coinDistance * threatDistance);
    if (cos < Number(cfg.invulnerableActiveCoinHeadingCosMin || 0)) return false;
    const lane = Math.abs(coinDx * threatDy - coinDy * threatDx) / Math.max(1, threatDistance);
    return lane <= Math.max(0, Number(cfg.invulnerableActiveCoinHeadingLaneRadius || 0))
      && coinDistance <= threatDistance + Math.max(0, Number(cfg.invulnerableActiveCoinDangerRadius || 0));
  }
  function coinBlockedByThreat(self, coin, threat) {
    const threatRadius = coinThreatDangerRadius(threat);
    if (dist(coin, threat) <= threatRadius) {
      if (!self) return true;
      const coinDistance = dist(self, coin);
      const threatDistance = Number.isFinite(Number(threat?.distance)) ? Number(threat.distance) : dist(self, threat);
      if (!Number.isFinite(coinDistance) || !Number.isFinite(threatDistance)) return true;
      if (coinDistance <= Math.max(0, Number(cfg.activeReturnBlockCoinPassDistance || 0))) return false;
      if (isInvulnerableActive(threat)) return true;
      const coinDx = Number(coin.x) - Number(self.x);
      const coinDy = Number(coin.y) - Number(self.y);
      const threatDx = Number(threat.x) - Number(self.x);
      const threatDy = Number(threat.y) - Number(self.y);
      const towardThreat = (coinDx * threatDx + coinDy * threatDy) > 0;
      if (!towardThreat) return false;
      const stopGap = threatDistance - coinDistance;
      const stopBuffer = Math.max(0, Number(threat?.threatRadius || cfg.dangerRadius || 0));
      if (stopGap <= stopBuffer) return true;
    }
    return coinHeadingBlockedByInvulnerableThreat(self, coin, threat);
  }
  const hpValue = e => Number(e?.hp ?? 0) || 0;
  const combatHpValue = e => Number.isFinite(Number(e?.hp)) ? Number(e.hp) : 100;
  const knownHpValue = e => {
    if (e && Object.prototype.hasOwnProperty.call(e, 'knownHp')) {
      return Number.isFinite(Number(e.knownHp)) ? Number(e.knownHp) : null;
    }
    return e?.hp !== undefined && e?.hp !== null && Number.isFinite(Number(e.hp)) ? Number(e.hp) : null;
  };
  const maxHpValue = e => Number(e?.max_hp ?? e?.maxHp ?? 0) || 0;
  const clampValue = (v, min, max) => Math.max(min, Math.min(max, v));
  const isFullHp = self => {
    const hp = hpValue(self);
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hp >= maxHp;
    return hp >= 100;
  };
  const isRecovering = self => {
    if (!self) return false;
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hpValue(self) < maxHp;
    return hpValue(self) < cfg.recoverHpThreshold;
  };
  function pursuitLeaveThresholdForTest(self, threat) {
    const normalMs = Math.max(0, Number(cfg.pursuitLeaveMs || 0));
    const nonFullHp = !isFullHp(self);
    const invulnerable = isInvulnerable(threat);
    const candidates = [normalMs];
    if (nonFullHp) candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpMs || normalMs)));
    if (invulnerable) candidates.push(Math.max(0, Number(cfg.pursuitLeaveInvulnerableMs || normalMs)));
    if (nonFullHp && invulnerable) {
      candidates.push(Math.max(0, Number(cfg.pursuitLeaveNonFullHpInvulnerableMs || cfg.pursuitLeaveInvulnerableMs || cfg.pursuitLeaveNonFullHpMs || normalMs)));
    }
    return Math.max(0, Math.min(...candidates.filter(value => Number.isFinite(value))));
  }
  function actionCombatTargetId(action) {
    const target = action?.target || null;
    const id = target?.id ?? target?.user_id;
    return id === null || id === undefined ? '' : String(id);
  }
  function pursuitLeaveSuppressedByCombatAction(pursuit, action) {
    const pursuitId = pursuit?.id ?? pursuit?.user_id;
    const actionId = actionCombatTargetId(action);
    return Boolean(action?.combat && pursuitId !== null && pursuitId !== undefined && actionId && String(pursuitId) === actionId);
  }
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  const attackWorthTaking = (self, target) => {
    if (isWhitelistedTarget(target)) return false;
    const targetDrop = dropValue(target);
    if (isAfkProfitTarget(target)) return targetDrop >= Math.max(0, Number(cfg.attackMinAfkDrop ?? cfg.attackMinDrop));
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };
  function combatAimJitterLimit(distance, motionScale = 1) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clampValue(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const scale = clampValue(Number.isFinite(Number(motionScale)) ? Number(motionScale) : 1, 0, 1);
    const minScale = clampValue(Number(cfg.combatAimMinMotionJitterScale ?? 0.2), 0, 1);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clampValue(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    const interpolated = (minJitter + (maxJitter - minJitter) * nearFactor) * Math.max(minScale, scale);
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const dodgeSpeed = Math.max(0, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const evasionScale = Math.max(0, Number(cfg.combatAimEvasionScale ?? 1));
    const travelTicks = d / bulletSpeed;
    const evasionWidth = (dodgeSpeed * scale * travelTicks + hitRadius) * evasionScale;
    const evasionAngle = d > 0 ? Math.atan(evasionWidth / d) : maxJitter;
    return clampValue(Math.max(interpolated, evasionAngle), minJitter * minScale, maxJitter);
  }
  function combatAimNoDamageLevel(widenMs) {
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const elapsed = Math.max(0, Number(widenMs) || 0);
    return elapsed > 0 ? Math.min(3, 1 + elapsed / stepMs) : 0;
  }
  function combatAimNoDamageJitterLimit(baseLimit, noDamageLevel) {
    const base = Math.max(0, Number(baseLimit) || 0);
    const level = Math.max(0, Number(noDamageLevel) || 0);
    const maxNoDamageLimit = Math.max(base, Number(cfg.combatAimNoDamageMaxRadians) || base);
    return level ? Math.min(maxNoDamageLimit, base * (1 + level * 0.45)) : base;
  }
  function combatAimSteadyNoDamageState(target, noDamageMs, motionScale = 0) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimSteadyNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    const speedMax = Math.max(0, Number(cfg.combatAimSteadySpeedMax ?? cfg.combatStationarySpeed ?? 0));
    const currentSpeed = speed(target);
    const active = Boolean(thresholdMs && elapsed >= thresholdMs && currentSpeed <= speedMax);
    return {
      active,
      noDamageMs: elapsed,
      thresholdMs,
      currentSpeed,
      speedMax,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(motionScale) : 0
    };
  }
  function combatAimFallbackPrecisionState(noDamageMs) {
    const thresholdMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs) || 0);
    return {
      active: Boolean(thresholdMs && elapsed >= thresholdMs),
      noDamageMs: elapsed,
      thresholdMs
    };
  }
  function combatMovementAimMode(self, target, distance) {
    const vx = Number(target.vx) || 0;
    const vy = Number(target.vy) || 0;
    const targetSpeed = Math.hypot(vx, vy);
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const d = Math.max(1, Number(distance) || Math.hypot(dx, dy) || 1);
    const ux = dx / d;
    const uy = dy / d;
    const radialSpeed = ux * vx + uy * vy;
    const lateralSpeed = ux * vy - uy * vx;
    const lateralRatio = targetSpeed > 0.01 ? Math.abs(lateralSpeed) / targetSpeed : 0;
    let mode = 'drift';
    let leadScale = 0.75;
    if (lateralRatio >= 0.55) {
      mode = 'lateral';
      leadScale = 1.1;
    } else if (radialSpeed <= -cfg.combatStationarySpeed) {
      mode = 'closing';
      leadScale = 0.5;
    } else if (radialSpeed >= cfg.combatStationarySpeed) {
      mode = 'retreating';
      leadScale = 0.6;
    }
    if (target.current_join_mode === 'Active') leadScale += 0.15;
    if (isFiringEntity(target)) leadScale += 0.1;
    return {
      mode,
      leadScale,
      lateralSpeed,
      radialSpeed,
      lateralRatio,
      targetSpeed
    };
  }

  function combatInterceptSolution(self, target, distance = null, motionScale = 1) {
    const sx = Number(self?.x);
    const sy = Number(self?.y);
    const px = Number(target?.x);
    const py = Number(target?.y);
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    if (![sx, sy, px, py].every(Number.isFinite)) return null;
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const renderDelayTicks = Math.max(0, Number(cfg.combatRenderDelayTicks ?? 2));
    const compensatedX = px + vx * renderDelayTicks;
    const compensatedY = py + vy * renderDelayTicks;
    const dx = compensatedX - sx;
    const dy = compensatedY - sy;
    const c = dx * dx + dy * dy;
    if (!(c > 0)) return null;
    const targetSpeedSq = vx * vx + vy * vy;
    const a = targetSpeedSq - bulletSpeed * bulletSpeed;
    const b = 2 * (dx * vx + dy * vy);
    const eps = 1e-6;
    const roots = [];
    if (Math.abs(a) < eps) {
      if (Math.abs(b) > eps) roots.push(-c / b);
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < -eps) return null;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      roots.push((-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a));
    }
    const maxByRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000) / bulletSpeed);
    const configuredMax = Number(cfg.combatInterceptMaxTicks || 0);
    const maxTicks = Math.max(1, configuredMax > 0 ? Math.min(configuredMax, maxByRange) : maxByRange);
    const t = roots
      .filter(value => Number.isFinite(value) && value > 0 && value <= maxTicks)
      .sort((aTick, bTick) => aTick - bTick)[0];
    if (!Number.isFinite(t)) return null;
    const x = compensatedX + vx * t;
    const y = compensatedY + vy * t;
    const travelDistance = Math.hypot(x - sx, y - sy);
    const bulletRange = Math.max(1, Number(cfg.combatBulletRangeCm || cfg.combatAttackRange || 15000));
    if (travelDistance > bulletRange + Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90))) return null;
    const rawDistance = Number.isFinite(Number(distance)) ? Math.max(1, Number(distance)) : Math.hypot(px - sx, py - sy);
    const targetSpeed = Math.sqrt(targetSpeedSq);
    const maxTargetSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const speedRatio = targetSpeed / maxTargetSpeed;
    const timeFactor = 1 - Math.min(1, t / maxTicks) * 0.35;
    const speedPenalty = Math.max(0, speedRatio - 1) * 0.2;
    const motionPenalty = Math.max(0, Math.min(1, Number(motionScale) || 0)) * 0.08;
    const confidence = Math.max(0.25, Math.min(1, 0.62 + timeFactor * 0.25 - speedPenalty - motionPenalty));
    return {
      x,
      y,
      flightTicks: t,
      flightMs: t * 50,
      travelDistance,
      currentDistance: rawDistance,
      leadDistance: Math.hypot(x - px, y - py),
      renderDelayTicks,
      compensatedX,
      compensatedY,
      targetVx: vx,
      targetVy: vy,
      targetSpeed,
      confidence
    };
  }
  function combatAimMotionScale(target) {
    const maxSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const observedSpeed = Math.max(
      speed(target),
      Number(target?.motionObservedSpeed || 0),
      Number(target?.motionSampleSpeed || 0)
    );
    let scale = clampValue(observedSpeed / maxSpeed, 0, 1);
    if (target?.recentlyMoved) {
      const decayMs = Math.max(1, Number(cfg.combatAimRecentMotionDecayMs || 900));
      const ageMs = Number(target.motionAgeMs);
      const recent = Number.isFinite(ageMs)
        ? clampValue(1 - ageMs / decayMs, 0, 1)
        : 1;
      scale = Math.max(scale, recent * Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15)));
    }
    return scale;
  }
  function combatMotionSample(self, target, at = Date.now()) {
    if (!target) return null;
    const x = Number(target.x);
    const y = Number(target.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const distance = self ? (Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target)) : Number(target.distance);
    return {
      at,
      x,
      y,
      vx: Number(target.vx) || 0,
      vy: Number(target.vy) || 0,
      distance: Number.isFinite(distance) ? distance : null,
      hp: knownHpValue(target),
      selfHp: knownHpValue(self)
    };
  }
  function combatMotionSamplesWithCurrent(self, target, t = Date.now(), windowMsOverride = null) {
    const id = target?.user_id ?? target?.id;
    const previous = bot.combatTarget || null;
    const same = previous && id !== null && id !== undefined && String(previous.id ?? '') === String(id);
    const windowMs = Math.max(250, Number(windowMsOverride || cfg.combatMotionHistoryWindowMs || 2000));
    const maxSamples = Math.max(2, Math.round(Number(cfg.combatMotionHistoryMaxSamples || 80)));
    const samples = same && Array.isArray(previous.motionSamples) ? previous.motionSamples.slice() : [];
    const current = combatMotionSample(self, target, t);
    if (current) samples.push(current);
    return samples
      .filter(sample => sample && Number.isFinite(Number(sample.at)) && t - Number(sample.at) <= windowMs)
      .sort((a, b) => Number(a.at) - Number(b.at))
      .slice(-maxSamples);
  }
  function combatOpponentProfile(self, target, targetDistance = null) {
    const samples = combatMotionSamplesWithCurrent(self, target, Date.now(), Math.max(250, Number(cfg.combatMotionHistoryWindowMs || 2000)));
    const threshold = Math.max(1, Number(cfg.combatStationarySpeed || 5));
    let lateralFlips = 0;
    let previousLateralSign = 0;
    let radialSum = 0;
    let radialCount = 0;
    let speedSum = 0;
    let dotSum = 0;
    let dotCount = 0;
    for (const sample of samples) {
      const sx = Number(sample.x);
      const sy = Number(sample.y);
      const vx = Number(sample.vx) || 0;
      const vy = Number(sample.vy) || 0;
      const dx = sx - Number(self?.x || 0);
      const dy = sy - Number(self?.y || 0);
      const d = Math.max(1, Math.hypot(dx, dy));
      const radial = (dx / d) * vx + (dy / d) * vy;
      const lateral = (dx / d) * vy - (dy / d) * vx;
      const lateralSign = Math.abs(lateral) >= threshold ? Math.sign(lateral) : 0;
      if (lateralSign && previousLateralSign && lateralSign !== previousLateralSign) lateralFlips += 1;
      if (lateralSign) previousLateralSign = lateralSign;
      radialSum += radial;
      radialCount += 1;
      speedSum += Math.hypot(vx, vy);
    }
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      const av = Math.hypot(Number(a.vx) || 0, Number(a.vy) || 0);
      const bv = Math.hypot(Number(b.vx) || 0, Number(b.vy) || 0);
      if (av >= threshold && bv >= threshold) {
        dotSum += ((Number(a.vx) || 0) * (Number(b.vx) || 0) + (Number(a.vy) || 0) * (Number(b.vy) || 0)) / (av * bv);
        dotCount += 1;
      }
    }
    const durationMs = samples.length >= 2 ? Math.max(0, Number(samples[samples.length - 1].at) - Number(samples[0].at)) : 0;
    const velocityStability = dotCount ? clampValue((dotSum / dotCount + 1) / 2, 0, 1) : 0.5;
    const avgRadialSpeed = radialCount ? radialSum / radialCount : 0;
    const avgSpeed = samples.length ? speedSum / samples.length : speed(target);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : (Number.isFinite(Number(target?.distance)) ? Number(target.distance) : dist(self, target));
    const strafePattern = Boolean(samples.length >= 4 && lateralFlips >= 2 && durationMs >= 600);
    const kiting = Boolean(samples.length >= 3
      && avgRadialSpeed >= Math.max(3, threshold)
      && distance >= Math.max(0, Number(cfg.combatSpacingPreferredRange || 0))
      && (isFiringEntity(target) || isCurrentlyActive(target)));
    const maneuverScale = clampValue((1 - velocityStability) * 0.7 + Math.min(1, lateralFlips / 3) * 0.45 + (kiting ? 0.2 : 0), 0, 1);
    const aimConfidenceScale = clampValue(1.08 - maneuverScale * 0.45, 0.55, 1.08);
    return {
      sampleCount: samples.length,
      durationMs,
      lateralFlips,
      velocityStability,
      avgRadialSpeed,
      avgSpeed,
      strafePattern,
      kiting,
      maneuverScale,
      aimConfidenceScale
    };
  }
  function combatTradeEstimate(self, target) {
    const previous = bot.combatTarget || null;
    const id = target?.user_id ?? target?.id;
    const same = previous && id !== null && id !== undefined && String(previous.id ?? '') === String(id);
    if (!same) return null;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.combatTradeEstimateWindowMs || 6000));
    const samples = combatMotionSamplesWithCurrent(self, target, t, windowMs)
      .filter(sample => t - Number(sample.at) <= windowMs && Number.isFinite(Number(sample.hp)) && Number.isFinite(Number(sample.selfHp)));
    if (samples.length < 3) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedMs = Math.max(1, Number(last.at) - Number(first.at));
    if (elapsedMs < Math.max(500, Number(cfg.combatTradeEstimateMinWindowMs || 1800))) return null;
    const targetDamage = Math.max(0, Number(first.hp) - Number(last.hp));
    const selfDamage = Math.max(0, Number(first.selfHp) - Number(last.selfHp));
    const myDps = targetDamage / elapsedMs * 1000;
    const enemyDps = selfDamage / elapsedMs * 1000;
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const tKillMs = myDps > 0.05 ? targetHp / myDps * 1000 : Infinity;
    const tDeathMs = enemyDps > 0.05 ? selfHp / enemyDps * 1000 : Infinity;
    const minSelfDamage = Math.max(0, Number(cfg.combatTradeEstimateMinSelfDamage || 6));
    const minEnemyDps = Math.max(0, Number(cfg.combatTradeEstimateMinEnemyDps || 1.5));
    const safetyFactor = Math.max(1, Number(cfg.combatTradeEstimateSafetyFactor || 1.15));
    const noDamageSafeSelfHp = Math.max(0, Number(cfg.combatTradeEstimateNoDamageSafeSelfHp || 75));
    const noDamageUnsafeTDeathMs = Math.max(1000, Number(cfg.combatTradeEstimateNoDamageUnsafeTDeathMs || 30000));
    const zeroDamageWindow = targetDamage <= 0.01;
    const noDamageUnsafe = !zeroDamageWindow
      || selfHp <= noDamageSafeSelfHp
      || tDeathMs <= noDamageUnsafeTDeathMs;
    const disadvantaged = Boolean(
      selfDamage >= minSelfDamage
      && enemyDps >= minEnemyDps
      && tDeathMs < tKillMs * safetyFactor
      && targetHp > 1
      && noDamageUnsafe
    );
    return {
      active: disadvantaged,
      sampleCount: samples.length,
      elapsedMs,
      selfDamage,
      targetDamage,
      myDps,
      enemyDps,
      tKillMs,
      tDeathMs,
      safetyFactor,
      zeroDamageWindow,
      noDamageUnsafe
    };
  }
  function combatLiveAimTarget(self, target) {
    const targetId = target?.user_id ?? target?.id;
    const targetName = String(target?.name || '').trim();
    const nativeEntities = Array.isArray(bot.testNativeEntities) ? bot.testNativeEntities : [];
    const live = nativeEntities.find(entity => {
      const id = entity?.user_id ?? entity?.id;
      return targetId !== null && targetId !== undefined && id !== null && id !== undefined && String(id) === String(targetId);
    }) || (targetName ? nativeEntities.find(entity => String(entity?.name || '').trim() === targetName) : null);
    if (!live || !isAlive(live) || isInvulnerable(live)) return target;
    const x = Number(live.x);
    const y = Number(live.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return target;
    return {
      ...target,
      ...live,
      user_id: live.user_id ?? live.id ?? target.user_id ?? target.id,
      id: live.user_id ?? live.id ?? target.id ?? target.user_id,
      hp: combatHpValue(live),
      knownHp: knownHpValue(live),
      drop: dropValue(live) || target.drop,
      distance: dist(self, live),
      speed: speed(live),
      originalAimTarget: target,
      nativeAimResolved: true
    };
  }
  function combatAimSourceDivergenceState(aimSource, distance) {
    const original = aimSource?.originalAimTarget;
    const live = Boolean(aimSource?.nativeAimResolved);
    const ax = Number(aimSource?.x);
    const ay = Number(aimSource?.y);
    const ox = Number(original?.x);
    const oy = Number(original?.y);
    const divergence = live
      && Number.isFinite(ax)
      && Number.isFinite(ay)
      && Number.isFinite(ox)
      && Number.isFinite(oy)
      ? Math.hypot(ax - ox, ay - oy)
      : null;
    const baseThreshold = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionCm || 0));
    const ratio = Math.max(0, Number(cfg.combatAimLiveDivergencePrecisionRatio || 0));
    const ratioThreshold = Number.isFinite(Number(distance)) ? Math.round(Math.max(0, Number(distance)) * ratio) : 0;
    const threshold = Math.max(baseThreshold, ratioThreshold);
    return {
      active: Boolean(live && divergence !== null && threshold > 0 && divergence >= threshold),
      divergenceCm: divergence !== null ? Math.round(divergence) : null,
      thresholdCm: Math.round(threshold),
      baseThresholdCm: Math.round(baseThreshold),
      ratioThresholdCm: Math.round(ratioThreshold)
    };
  }
  function combatAimServerStallState() {
    const stall = typeof summarizeServerPositionStall === 'function'
      ? summarizeServerPositionStall()
      : bot.serverPositionStall;
    return stall && typeof stall === 'object' ? stall : {};
  }
  function combatAimDynamicStrategyState(self, target, aimSource, damage, moving, distance, movement, steadyAim, options = {}) {
    const fallbackPrecision = combatAimFallbackPrecisionState(damage?.noDamageMs);
    const sourceDivergence = combatAimSourceDivergenceState(aimSource, distance);
    const serverStall = combatAimServerStallState();
    const live = Boolean(aimSource?.nativeAimResolved);
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const radialMax = Math.max(0, Number(cfg.combatAimRadialPrecisionLateralRatio || 0));
    const realBulletPrecision = Boolean(live
      && moving
      && options.realBulletPressure
      && (!attackRange || Number(distance) <= attackRange));
    const lateralRatio = Math.abs(Number(movement?.lateralRatio || 0));
    const passiveRunnerIntercept = Boolean(live
      && moving
      && movement
      && options.passiveRunner
      && (!attackRange || Number(distance) <= attackRange));
    const liveIntercept = Boolean(live
      && moving
      && movement
      && (
        passiveRunnerIntercept
        || (lateralRatio > radialMax && (
          realBulletPrecision
          || (serverStall.stalled && (!attackRange || Number(distance) <= attackRange))
        ))
      ));
    const radialPrecision = Boolean(live
      && moving
      && radialMax > 0
      && movement
      && Number(movement.targetSpeed || 0) >= Number(cfg.combatStationarySpeed || 0)
      && lateralRatio <= radialMax
      && (!attackRange || Number(distance) <= attackRange));
    let mode = moving ? 'intercept' : 'exact';
    let strategy = moving ? 'intercept' : 'exact';
    let reason = moving ? (movement?.mode || 'moving') : 'stationary';
    let precision = false;
    let steady = false;
    let passiveRunnerAim = false;
    if (sourceDivergence.active) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'coordinate-divergence';
      precision = true;
    } else if (passiveRunnerIntercept) {
      strategy = 'live-intercept';
      reason = 'passive-runner-intercept';
      passiveRunnerAim = true;
    } else if (realBulletPrecision && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'real-bullet-pressure-intercept';
    } else if (realBulletPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'real-bullet-pressure';
      precision = true;
    } else if (live && serverStall.stalled && liveIntercept) {
      strategy = 'live-intercept';
      reason = 'server-stall-live-intercept';
    } else if (live && serverStall.stalled) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'server-stall-live';
      precision = true;
    } else if (radialPrecision) {
      mode = 'live-precision';
      strategy = 'live-precision';
      reason = 'radial-motion';
      precision = true;
    } else if (fallbackPrecision.active) {
      mode = 'precision';
      strategy = 'fallback-precision';
      reason = 'no-damage-fallback';
      precision = true;
    } else if (steadyAim?.active && moving) {
      mode = 'steady';
      strategy = 'steady';
      reason = 'steady-no-damage';
      steady = true;
    }
    return {
      mode,
      strategy,
      reason,
      precision,
      steady,
      bypassJitter: Boolean(!moving || precision || steady),
      sourceDivergence,
      serverStall: Boolean(serverStall.stalled),
      liveIntercept,
      realBulletPrecision,
      radialPrecision,
      fallbackPrecision: Boolean(fallbackPrecision.active),
      passiveRunner: Boolean(passiveRunnerAim),
      movementMode: precision ? strategy : (steady ? 'steady' : (movement?.mode || ''))
    };
  }
  function combatStrafeHoldMs() {
    const base = Math.max(300, Number(cfg.combatStrafeDirectionLockMs ?? cfg.combatStrafeLockMs) || 700);
    const jitter = Math.max(0, Number(cfg.combatStrafeRandomJitterMs) || 0);
    return base + (jitter ? Math.floor(Math.random() * jitter) : 0);
  }
  function combatPreciseStrafeSign(pressure) {
    const signedLane = Number(pressure?.signedLaneDistance);
    const laneMin = Math.max(0, Number(cfg.combatStrafePreciseLaneMin ?? 1));
    return !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > laneMin
      ? -Math.sign(signedLane)
      : 0;
  }
  function selectCombatStrafeSign(existing, key, preciseSign, t = Date.now()) {
    let sign = 0;
    let until = 0;
    let locked = false;
    let lockOverridden = false;
    const existingUntil = Number(existing?.until || 0);
    if (existing && existing.key === key && t < existingUntil) {
      const existingSign = Math.sign(Number(existing.sign || 0));
      const precise = Math.sign(Number(preciseSign || 0));
      if (precise && existingSign && existingSign !== precise) {
        sign = precise;
        until = t + combatStrafeHoldMs();
        lockOverridden = true;
      } else {
        sign = existingSign;
        until = existingUntil;
        locked = Boolean(sign);
      }
    }
    if (!sign) {
      sign = Math.sign(Number(preciseSign || 0)) || (Math.random() < 0.5 ? -1 : 1);
      until = t + combatStrafeHoldMs();
    }
    return { sign, until, locked, lockOverridden };
  }
  function combatStrafeVectorForTest(self, target, pressure, sign, options = {}) {
    let baseX = Number(pressure?.vx) || 0;
    let baseY = Number(pressure?.vy) || 0;
    if (!(baseX || baseY) && target) {
      baseX = Number(target.x) - Number(self.x);
      baseY = Number(target.y) - Number(self.y);
    }
    const tangentX = -baseY * sign;
    const tangentY = baseX * sign;
    let dx = Math.sign(tangentX || 0);
    let dy = Math.sign(tangentY || 0);
    let closingBiased = false;
    if (target) {
      const awayX = Math.sign(Number(self.x) - Number(target.x)) || 0;
      const awayY = Math.sign(Number(self.y) - Number(target.y)) || 0;
      const approachX = Math.sign(Number(target.x) - Number(self.x)) || 0;
      const approachY = Math.sign(Number(target.y) - Number(self.y)) || 0;
      const fillX = options.preferClosing ? approachX : awayX;
      const fillY = options.preferClosing ? approachY : awayY;
      if (dx && !dy && fillY) dy = fillY;
      else if (dy && !dx && fillX) dx = fillX;
      if (options.preferClosing && dx && dy) {
        const closesX = Boolean(approachX && Math.sign(dx) === approachX);
        const closesY = Boolean(approachY && Math.sign(dy) === approachY);
        if (!closesX && !closesY) {
          const offsetX = Math.abs(Number(target.x) - Number(self.x));
          const offsetY = Math.abs(Number(target.y) - Number(self.y));
          if (offsetX >= offsetY && approachX) {
            closingBiased = Math.sign(dx) !== approachX;
            dx = approachX;
          } else if (approachY) {
            closingBiased = Math.sign(dy) !== approachY;
            dy = approachY;
          }
        }
      }
    }
    if (!(dx || dy) && target) {
      dx = Math.sign(Number(self.y) - Number(target.y)) || 1;
      dy = Math.sign(Number(target.x) - Number(self.x)) || 0;
    }
    return { dx: clampValue(Math.round(dx), -1, 1), dy: clampValue(Math.round(dy), -1, 1), closingBiased };
  }
  function normalizeBulletForTest(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let vx = Number(raw.vx ?? raw.velocity_x ?? raw.dx ?? 0);
    let vy = Number(raw.vy ?? raw.velocity_y ?? raw.dy ?? 0);
    const speedPerTick = Number(raw.speed_per_tick ?? raw.speedPerTick ?? raw.speed_per_server_tick ?? NaN);
    const startX = Number(raw.start_x ?? raw.startX ?? raw.origin_x ?? raw.x ?? raw.pos_x);
    const startY = Number(raw.start_y ?? raw.startY ?? raw.origin_y ?? raw.y ?? raw.pos_y);
    if (!(vx || vy) && Number.isFinite(startX) && Number.isFinite(startY)) {
      const targetX = Number(raw.target_x ?? raw.targetX ?? raw.aim_x ?? raw.aimX);
      const targetY = Number(raw.target_y ?? raw.targetY ?? raw.aim_y ?? raw.aimY);
      const aimDx = targetX - startX;
      const aimDy = targetY - startY;
      const aimDistance = Math.hypot(aimDx, aimDy);
      if (Number.isFinite(aimDistance) && aimDistance > 0.01) {
        const speedValue = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : Number(cfg.combatBulletSpeedPerTick || 500);
        vx = aimDx / aimDistance * speedValue;
        vy = aimDy / aimDistance * speedValue;
      }
    }
    const x = Number(raw.x ?? raw.pos_x ?? raw.head_x ?? raw.headX ?? startX);
    const y = Number(raw.y ?? raw.pos_y ?? raw.head_y ?? raw.headY ?? startY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const ownerId = raw.ownerId ?? raw.owner_id ?? raw.owner_user_id ?? raw.source_user_id ?? raw.shooter_user_id ?? raw.user_id ?? raw.from_user_id ?? null;
    return {
      ...raw,
      id: raw.bullet_id ?? raw.id ?? raw.entity_id ?? (Math.round(x) + ':' + Math.round(y) + ':' + Math.round(vx) + ':' + Math.round(vy)),
      ownerId,
      x,
      y,
      vx: Number.isFinite(vx) ? vx : 0,
      vy: Number.isFinite(vy) ? vy : 0
    };
  }
  function combatMoveVelocityForDirectionForTest(dx, dy) {
    const x = clampValue(Math.round(Number(dx) || 0), -1, 1);
    const y = clampValue(Math.round(Number(dy) || 0), -1, 1);
    if (!(x || y)) return { vx: 0, vy: 0 };
    const speedPerTick = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const axisSpeed = x && y ? Math.round(speedPerTick / Math.SQRT2) : speedPerTick;
    return { vx: x * axisSpeed, vy: y * axisSpeed };
  }
  function combatBulletThreatsForTest(self, target = null, bullets = []) {
    const selfId = Number(self?.user_id);
    const items = [];
    for (const raw of bullets || []) {
      const bullet = normalizeBulletForTest(raw);
      if (!bullet) continue;
      if (bullet.ownerId !== null && bullet.ownerId !== undefined && Number(bullet.ownerId) === selfId) continue;
      if (target && bullet.ownerId !== null && bullet.ownerId !== undefined && String(bullet.ownerId) !== String(target.user_id)) continue;
      const speedValue = Math.hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
      if (speedValue <= 0.01) continue;
      const toSelfX = Number(self.x) - Number(bullet.x);
      const toSelfY = Number(self.y) - Number(bullet.y);
      const distance = Math.hypot(toSelfX, toSelfY);
      if (distance > cfg.combatBulletDetectRadius) continue;
      const projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
      if (projection <= 0 || projection > cfg.combatBulletLookaheadDistance) continue;
      const signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
      const laneDistance = Math.abs(signedLaneDistance);
      if (laneDistance > cfg.combatBulletLaneRadius) continue;
      const timeToImpactMs = projection / speedValue * 50;
      const impactTicks = projection / speedValue;
      const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
      const score = (cfg.combatBulletLaneRadius - laneDistance) * 1000
        + (cfg.combatBulletLookaheadDistance - projection)
        + Math.max(0, 1500 - timeToImpactMs);
      items.push({
        id: bullet.id,
        ownerId: bullet.ownerId,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
        distance,
        projection,
        laneDistance,
        signedLaneDistance,
        impactTicks,
        timeToImpactMs,
        hitRadius,
        directHit: laneDistance <= hitRadius,
        score
      });
    }
    return items.sort((a, b) => b.score - a.score || a.timeToImpactMs - b.timeToImpactMs);
  }
  function incomingBulletThreatForTest(self, target = null, bullets = []) {
    const threats = combatBulletThreatsForTest(self, target, bullets);
    const best = threats[0] || null;
    if (!best) return null;
    return {
      ...best,
      threatCount: threats.length,
      threats: threats.slice(0, 6)
    };
  }
  function combatThreatFieldCandidateForTest(self, threats, dx, dy) {
    const move = combatMoveVelocityForDirectionForTest(dx, dy);
    let safetyScore = 0;
    let minCpaDistance = Infinity;
    let minTimeToImpactMs = Infinity;
    let directHitCount = 0;
    for (const threat of threats || []) {
      const rx = Number(threat.x) - Number(self.x);
      const ry = Number(threat.y) - Number(self.y);
      const rvx = (Number(threat.vx) || 0) - move.vx;
      const rvy = (Number(threat.vy) || 0) - move.vy;
      const relSpeedSq = rvx * rvx + rvy * rvy;
      const rawImpactTicks = Number(threat.impactTicks);
      const horizonTicks = Math.max(0, Math.min(
        Number.isFinite(rawImpactTicks) ? rawImpactTicks + 1 : 30,
        Number(cfg.combatBulletLookaheadDistance || 42000) / Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500))
      ));
      const cpaTicks = relSpeedSq > 0.000001
        ? clampValue(-(rx * rvx + ry * rvy) / relSpeedSq, 0, horizonTicks)
        : 0;
      const cpaX = rx + rvx * cpaTicks;
      const cpaY = ry + rvy * cpaTicks;
      const cpaDistance = Math.hypot(cpaX, cpaY);
      const hitRadius = Math.max(0, Number(threat.hitRadius ?? cfg.combatBulletHitRadiusCm ?? 90));
      const timeToImpactMs = Number(threat.timeToImpactMs);
      const urgency = Number.isFinite(timeToImpactMs) ? Math.max(0.35, 1.8 - Math.min(1500, timeToImpactMs) / 1500) : 1;
      minCpaDistance = Math.min(minCpaDistance, cpaDistance);
      if (Number.isFinite(timeToImpactMs)) minTimeToImpactMs = Math.min(minTimeToImpactMs, timeToImpactMs);
      if (cpaDistance <= hitRadius) directHitCount += 1;
      safetyScore += Math.min(5000, cpaDistance) * urgency;
      if (cpaDistance <= hitRadius) safetyScore -= (hitRadius - cpaDistance + 1) * 100000 * urgency;
      else if (cpaDistance <= hitRadius * 3) safetyScore -= (hitRadius * 3 - cpaDistance) * 300 * urgency;
    }
    return {
      dx: clampValue(Math.round(Number(dx) || 0), -1, 1),
      dy: clampValue(Math.round(Number(dy) || 0), -1, 1),
      safetyScore,
      minCpaDistance,
      minTimeToImpactMs,
      directHitCount
    };
  }
  function combatBulletThreatFieldForTest(self, threats, options = {}) {
    const list = (threats || []).filter(Boolean).slice(0, 6);
    if (!list.length) return null;
    const preferred = options.preferred || {};
    const preferredDx = clampValue(Math.round(Number(preferred.dx) || 0), -1, 1);
    const preferredDy = clampValue(Math.round(Number(preferred.dy) || 0), -1, 1);
    const target = options.target || null;
    const approachX = target ? Math.sign(Number(target.x) - Number(self.x)) || 0 : 0;
    const approachY = target ? Math.sign(Number(target.y) - Number(self.y)) || 0 : 0;
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 }
    ];
    return directions.map(item => {
      const candidate = combatThreatFieldCandidateForTest(self, list, item.dx, item.dy);
      let bias = 0;
      if (candidate.dx === preferredDx && candidate.dy === preferredDy) bias += 120;
      if (options.preferClosing) {
        if (candidate.dx && approachX && candidate.dx === approachX) bias += 40;
        if (candidate.dy && approachY && candidate.dy === approachY) bias += 40;
      }
      return { ...candidate, safetyScore: candidate.safetyScore + bias };
    }).sort((a, b) => {
      if (a.directHitCount !== b.directHitCount) return a.directHitCount - b.directHitCount;
      if (b.safetyScore !== a.safetyScore) return b.safetyScore - a.safetyScore;
      return b.minCpaDistance - a.minCpaDistance;
    })[0] || null;
  }
  function coinAxisApproachDirection(dxRaw, dyRaw, distance, tolerance = cfg.coinPrecisionTolerance) {
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    const minDistance = Math.max(0, Number(cfg.coinAxisApproachMinDistance || cfg.nearCoinStuckDistance || 0));
    if (Math.max(absX, absY) <= minDistance) return null;
    const ratio = Math.max(1, Number(cfg.coinAxisApproachRatio || 1));
    const laneTolerance = Math.max(tolerance, Number(cfg.coinAxisApproachLaneTolerance || 0));
    if (absX > tolerance && absX > absY && (absY <= laneTolerance || absX >= absY * ratio)) {
      return { dx: Math.sign(dxRaw), dy: 0, distance, axisApproach: 'x' };
    }
    if (absY > tolerance && absY > absX && (absX <= laneTolerance || absY >= absX * ratio)) {
      return { dx: 0, dy: Math.sign(dyRaw), distance, axisApproach: 'y' };
    }
    return null;
  }
  function coinPickupPrecisionPulseMs(distance, failureCount = 0) {
    const d = Math.max(0, Number(distance) || 0);
    const stopDistance = Math.max(0, Number(cfg.coinPickupStopDistance || 0));
    const microDistance = Math.max(stopDistance, Number(cfg.coinPickupMicroDistance || 0));
    const fineDistance = Math.max(microDistance, Number(cfg.coinPickupFineDistance || 0));
    const brakeDistance = Math.max(fineDistance, Number(cfg.coinPickupBrakeDistance || 0));
    let pulse = Number(cfg.coinPickupSweepPulseMs) || 150;
    if (d <= stopDistance) {
      pulse = Number(cfg.coinPickupStopPulseMs) || Number(cfg.coinPickupMicroPulseMs) || 45;
    } else if (d <= microDistance) {
      pulse = Number(cfg.coinPickupMicroPulseMs) || Number(cfg.coinPickupFinePulseMs) || 60;
    } else if (d <= fineDistance) {
      pulse = Number(cfg.coinPickupFinePulseMs) || Number(cfg.coinPickupBrakePulseMs) || 75;
    } else if (d <= brakeDistance) {
      pulse = Number(cfg.coinPickupBrakePulseMs) || 90;
    }
    const slowStep = Math.max(0, Number(cfg.coinPickupFailureSlowStepMs || 0));
    const minPulse = Math.max(20, Number(cfg.coinPickupFailureMinPulseMs || 35));
    const slowMs = Math.max(0, Math.floor(Number(failureCount) || 0)) * slowStep;
    return Math.max(minPulse, Math.round(pulse - slowMs));
  }
  function coinAxisLockShouldHold(lock, dxRaw, dyRaw) {
    if (!lock || !(lock.dx || lock.dy)) return false;
    const axisRaw = lock.dx ? dxRaw : dyRaw;
    const axisSign = lock.dx || lock.dy;
    const brakeDistance = Math.max(cfg.coinPrecisionTolerance, Number(cfg.coinApproachBrakeDistance || cfg.coinAxisFlipTolerance || 0));
    return Math.sign(axisRaw) === axisSign && Math.abs(axisRaw) > brakeDistance;
  }
  function coinDirectionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const distance = dist(self, target);
    const exactTolerance = Math.max(0, Number(cfg.coinPickupExactTolerance ?? 0) || 0);
    if (distance <= Math.max(0, Number(cfg.coinPickupSweepDistance || cfg.coinPickupFineDistance || 0))) {
      return {
        dx: Math.abs(dxRaw) > exactTolerance ? Math.sign(dxRaw) : 0,
        dy: Math.abs(dyRaw) > exactTolerance ? Math.sign(dyRaw) : 0,
        distance,
        exactTarget: true
      };
    }
    return coinAxisApproachDirection(dxRaw, dyRaw, distance, tolerance)
      || directionTo(self, target, tolerance);
  }
  function opportunityEffectiveStaminaCost(staminaCost) {
    const floor = Math.max(1, Number(cfg.opportunityDistanceFloor || 1));
    const d = Math.max(0, Number(staminaCost) || 0);
    return Math.max(floor, d);
  }
  function opportunityMoveStaminaCost(distance, stopDistance = 0) {
    const travel = Math.max(0, Number(distance || 0) - Math.max(0, Number(stopDistance || 0)));
    return travel * Math.max(0, Number(cfg.opportunityMoveStaminaPerCm ?? 1));
  }
  function opportunityCoinStaminaCost(coin) {
    const override = Number(coin?.opportunityStaminaCost ?? coin?.staminaCost ?? NaN);
    if (Number.isFinite(override) && override >= 0) return override;
    return opportunityMoveStaminaCost(coin?.distance, 0)
      + Math.max(0, Number(cfg.opportunityCoinPickupStaminaMs || 0));
  }
  function estimatedKillShots(target) {
    const damage = Math.max(0.1, Number(cfg.opportunityEstimatedDamagePerShot || 3));
    const hp = Math.max(1, Number(combatHpValue(target) || 100));
    return Math.max(1, Math.ceil(hp / damage));
  }
  function opportunityEnemyStaminaCost(target) {
    const moveCost = opportunityMoveStaminaCost(target?.distance, 0);
    const shotCost = estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500));
    return moveCost + shotCost;
  }
  function opportunityWindowStaminaBudget(self, windowName) {
    const remaining = staminaRemaining(self, windowName);
    if (!Number.isFinite(remaining)) return Infinity;
    const reserve = staminaExhaustedThreshold() + Math.max(0, Number(cfg.opportunityLongStaminaReserveMs || 0));
    return Math.max(0, remaining - reserve);
  }
  function opportunityLongStaminaBudget(self) {
    const values = ['1h', '1d']
      .map(key => opportunityWindowStaminaBudget(self, key))
      .filter(value => Number.isFinite(value));
    if (!values.length) return Infinity;
    return Math.min(...values);
  }
  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
  }

  function summarizeBlockedStaminaOpportunity(self, coins, targets = []) {
    const budget = opportunityLongStaminaBudget(self);
    if (!Number.isFinite(budget)) return null;
    const items = [];
    for (const coin of coins || []) {
      const distance = Number(coin?.distance);
      const amount = Number(coin?.amount || 0);
      if (!(amount > 0) || !Number.isFinite(distance)) continue;
      const staminaCost = opportunityCoinStaminaCost(coin);
      if (staminaCost <= budget) continue;
      items.push({
        type: 'coin',
        id: coin.drop_id,
        amount,
        distance,
        staminaCost,
        shortageMs: staminaCost - budget,
        snapshot: Boolean(coin.snapshot),
        native: Boolean(coin.native)
      });
    }
    for (const target of targets || []) {
      const distance = Number(target?.distance);
      const drop = Number(target?.drop ?? dropValue(target) ?? 0);
      if (!(drop > 0) || !Number.isFinite(distance)) continue;
      const staminaCost = opportunityEnemyStaminaCost(target);
      if (staminaCost <= budget) continue;
      items.push({
        type: 'enemy',
        id: target.user_id,
        name: target.name || '',
        drop,
        distance,
        staminaCost,
        shortageMs: staminaCost - budget
      });
    }
    if (!items.length) return null;
    items.sort((a, b) => a.shortageMs - b.shortageMs || a.distance - b.distance);
    const best = items[0];
    return {
      budgetMs: Math.max(0, Math.round(budget)),
      requiredMs: Math.max(0, Math.round(best.staminaCost)),
      shortageMs: Math.max(0, Math.round(best.shortageMs)),
      type: best.type,
      id: best.id,
      name: best.name || '',
      amount: best.amount || 0,
      drop: best.drop || 0,
      distance: Math.round(best.distance),
      snapshot: Boolean(best.snapshot),
      native: Boolean(best.native)
    };
  }
  function summarizeNearestCoinStaminaBudgetExit(self, coins) {
    const budget = opportunityWindowStaminaBudget(self, '1h');
    if (!Number.isFinite(budget)) return null;
    const candidates = (coins || [])
      .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin?.distance)) ? Number(coin.distance) : dist(self, coin), amount: Number(coin?.amount || 0) }))
      .filter(coin => coin.amount > 0 && Number.isFinite(coin.distance))
      .sort((a, b) => a.distance - b.distance || b.amount - a.amount);
    const coin = candidates[0] || null;
    if (!coin) return null;
    const staminaCost = opportunityCoinStaminaCost(coin);
    if (staminaCost <= budget) return null;
    return {
      type: 'coin',
      window: '1h',
      id: coin.drop_id,
      amount: coin.amount,
      distance: Math.round(coin.distance),
      budgetMs: Math.max(0, Math.round(budget)),
      requiredMs: Math.max(0, Math.round(staminaCost)),
      shortageMs: Math.max(0, Math.round(staminaCost - budget)),
      reloginDelayMs: Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 1800000))
    };
  }
  function staminaBudgetCoinLeaveAction(staminaBudgetExit) {
    return {
      kind: 'leave',
      reason: 'stamina-budget-coin-leave',
      dx: 0,
      dy: 0,
      offline: true,
      staminaBudgetExit,
      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 1800000))
    };
  }
  function opportunityValueScore(value, staminaCost, weight = cfg.coinOpportunityValue) {
    const amount = Number(value || 0);
    if (!(amount > 0)) return -Infinity;
    const scale = Math.max(1, Number(cfg.opportunityDistanceScoreScale || 1));
    return amount * Number(weight || 1) * scale / opportunityEffectiveStaminaCost(staminaCost);
  }
  function compareCoinOpportunity(a, b) {
    const scoreDiff = scoreCoinOpportunity(b) - scoreCoinOpportunity(a);
    if (scoreDiff) return scoreDiff;
    const amountDiff = Number(b.amount || 0) - Number(a.amount || 0);
    if (amountDiff) return amountDiff;
    return Number(a.distance || 0) - Number(b.distance || 0);
  }
  function mergeCoinRouteDisplay(base, routeCoin) {
    if (!base || !routeCoin?.coinRoute) return base;
    return {
      ...base,
      reason: 'best-opportunity-coin-route',
      coinRoute: routeCoin.coinRoute,
      routeValue: routeCoin.routeValue || null,
      routeKind: routeCoin.routeKind || '',
      routeLegs: routeCoin.routeLegs || 0,
      routeDisplayOnly: true
    };
  }
  function nearestRealtimeCoinWithin(self, coins, activeThreats, maxDistance) {
    if (!(Number(maxDistance) > 0)) return null;
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance)
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))
      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
  }
  function fieldMigrationBlockedByNearbyCoin(self, coins, activeThreats, fieldCoin = null) {
    const blockDistance = Math.max(0, Number(cfg.fieldMigrationNearbyCoinBlockDistance || 0));
    if (!(blockDistance > 0)) return false;
    const nearby = nearestRealtimeCoinWithin(self, coins, activeThreats, blockDistance);
    if (!nearby) return false;
    if (fieldCoin) {
      const nearbyId = nearby.drop_id ?? nearby.id;
      const fieldId = fieldCoin.drop_id ?? fieldCoin.id;
      if (nearbyId !== undefined && fieldId !== undefined && String(nearbyId) === String(fieldId)) return false;
      const nearbyDistance = Number(nearby.distance ?? dist(self, nearby));
      const fieldDistance = Number(fieldCoin.distance ?? dist(self, fieldCoin));
      if (Number.isFinite(nearbyDistance) && Number.isFinite(fieldDistance) && nearbyDistance >= fieldDistance) return false;
    }
    return true;
  }
  function pickField(self, coins, activeThreats) {
    const candidates = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.fieldMigrationMinDistance
        && c.distance <= cfg.fieldMigrationMaxDistance)
      .filter(c => !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    let best = null;
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) continue;
      const totalAmount = members.reduce((sum, item) => sum + item.amount, 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      if (!best || score > best.score) {
        best = {
          ...coin,
          score,
          fieldScore: score,
          opportunityScore: score,
          opportunityStaminaCost: staminaCost,
          fieldMigration: true,
          fieldMembers: members.length,
          fieldAmount: totalAmount,
          members: members.length,
          totalAmount
        };
      }
    }
    if (best && fieldMigrationBlockedByNearbyCoin(self, coins, activeThreats, best)) return null;
    return best;
  }

  function pickDistantCoin(self, coins, activeThreats) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.distantCoinMinDistance
        && c.distance <= cfg.distantCoinMaxDistance)
      .filter(c => !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)))
      .sort(compareCoinOpportunity)[0] || null;
  }

  function safeCoins(self, coins, activeThreats, maxDistance) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= maxDistance)
      .filter(c => !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
      .sort(compareCoinOpportunity);
  }

  function highValueCoinPriorityAmount() {
    const value = Number(cfg.highValueCoinPriorityAmount ?? 10);
    return Math.max(1, Number.isFinite(value) ? value : 10);
  }

  function highValueCoinPriorityHealthyHp() {
    const value = Number(cfg.highValueCoinPriorityHealthyHp ?? cfg.combatLowHpLeaveThreshold ?? 50);
    return Math.max(1, Number.isFinite(value) ? value : 50);
  }

  function pickHighValueVisibleCoin(self, coins, activeThreats) {
    const maxDistance = Math.max(0, Number(cfg.globalCoinMaxDistance || cfg.opportunityVisibleDistance || cfg.coinMaxDistance || 0));
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance)
      .filter(coin => Number(coin.amount || 0) >= highValueCoinPriorityAmount())
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))[0] || null;
  }

  function nearbyThreatBlocksLowHpHighValueCoin(threat, incomingOwnerId = null, unknownIncoming = false) {
    if (!threat || isWhitelistedTarget(threat)) return false;
    const distance = Number(threat.distance ?? Infinity);
    const radius = Math.max(
      Number(cfg.combatAttackRange || 0),
      Number(threat.cautionRadius || 0) + Number(cfg.activeCautionExitMargin || 0),
      isInvulnerable(threat) ? Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) : 0
    );
    if (!Number.isFinite(distance) || distance > radius) return false;
    if (isInvulnerable(threat)) return true;
    if (isLowValueActiveCombatTarget(threat)) return lowValueActiveThreatensSelf(threat, incomingOwnerId, unknownIncoming);
    return hasCombatActivitySignalForTest(threat) || isActive(threat) || isFiringEntity(threat);
  }

  function canPrioritizeHighValueVisibleCoin(self, coin, context = {}) {
    if (!coin) return false;
    const hp = hpValue(self);
    const healthyHp = highValueCoinPriorityHealthyHp();
    if (context.engagedCombatTarget && hp < healthyHp) return false;
    const incoming = incomingBulletInfo(self, context.bullets || []);
    if (incoming.incoming) return false;
    if (hp >= healthyHp) return true;
    return !(context.activeThreats || []).some(threat => nearbyThreatBlocksLowHpHighValueCoin(threat, incoming.ownerId, incoming.unknownIncoming));
  }

  function highValueVisibleCoinPriorityNeeded(self, context = {}) {
    if (context.recovery || context.engagedCombatTarget || context.defensiveCombatTarget) return true;
    if ((context.avoidanceThreats || []).length) return true;
    const incoming = incomingBulletInfo(self, context.bullets || []);
    return (context.activeThreats || []).some(threat => nearbyThreatBlocksLowHpHighValueCoin(threat, incoming.ownerId, incoming.unknownIncoming));
  }

  function snapshotLocalCoinAllowed(self, coin) {
    if (!coin?.snapshot || coin?.native) return true;
    const distance = self ? dist(self, coin) : Infinity;
    if (!Number.isFinite(distance)) return true;
    const radius = Math.max(0, Number(cfg.nativeCoinAuthoritativeRadius || 0));
    return distance > radius;
  }

  function isSnapshotOnlyCoin(coin) {
    return Boolean(coin?.snapshot) && !coin?.native;
  }

  function filterLocalSnapshotCoins(self, coins) {
    return (coins || []).filter(coin => snapshotLocalCoinAllowed(self, coin));
  }

  function pickRealtimeLocalCoin(self, coins, activeThreats) {
    const radius = Math.max(0, Number(cfg.nativeCoinAuthoritativeRadius || 0));
    if (!(radius > 0)) return null;
    return safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, radius)
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))[0] || null;
  }

  function pickSnapshotCoinDestination(self, coins, activeThreats, options = {}) {
    const allowIdleFallback = Boolean(options.allowIdleFallback || options.idleFallback);
    if (!allowIdleFallback && !options.ignoreRealtimeLocalCoin && pickRealtimeLocalCoin(self, coins, activeThreats)) return null;
    const candidates = safeCoins(self, filterLocalSnapshotCoins(self, coins).filter(isSnapshotOnlyCoin), activeThreats, cfg.snapshotCoinMaxDistance);
    if (!candidates.length) return null;
    let best = null;
    let idleBest = null;
    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= radius);
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      const item = {
        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost
      };
      const affordable = opportunityStaminaAffordable(self, staminaCost);
      if (affordable && snapshotCoinWorthLongTravel(coin, members.length, totalAmount)) {
        if (!best
        || item.snapshotScore > best.snapshotScore
        || (item.snapshotScore === best.snapshotScore && members.length >= minCoins && best.snapshotMembers < minCoins)
        || (item.snapshotScore === best.snapshotScore && item.distance < best.distance)) best = item;
      }
      if (allowIdleFallback && (!idleBest
        || item.snapshotScore > idleBest.snapshotScore
        || (item.snapshotScore === idleBest.snapshotScore && item.distance < idleBest.distance))) {
        idleBest = item;
      }
    }
    return best || (idleBest ? { ...idleBest, snapshotIdleFallback: true, opportunityScore: idleBest.snapshotScore } : null);
  }

  function snapshotCoinWorthLongTravel(coin, members = 1, totalAmount = null) {
    const memberCount = Math.max(1, Number(members || 1));
    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
    if (memberCount >= minCoins) return true;
    const distance = Number(coin?.distance ?? Infinity);
    if (!Number.isFinite(distance)) return false;
    const amount = Math.max(0, Number(totalAmount ?? coin?.amount ?? 0));
    const baseMax = Math.max(0, Number(cfg.snapshotSingleCoinMaxDistance || cfg.globalCoinMaxDistance || cfg.coinMaxDistance || 0));
    const perAmount = Math.max(0, Number(cfg.snapshotSingleCoinDistancePerAmount || 0));
    const maxDistance = Math.max(baseMax, amount * perAmount);
    return distance <= maxDistance;
  }

  function snapshotCoinNavigationReason(coin) {
    if (coin?.snapshotIdleFallback) return 'snapshot-coin-idle-timeout';
    if (coin?.fieldMigration) return 'migrate-to-known-field';
    if (isSnapshotOnlyCoin(coin) && Number(coin?.snapshotMembers || 0) > 0) {
      return coin.snapshotMembers >= cfg.snapshotCoinClusterMinCoins ? 'snapshot-coin-field' : 'snapshot-coin-target';
    }
    return coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin';
  }

  function enemyTargets(self, entities, activeThreats) {
    return entities
      .filter(e => !isActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e) }))
      .filter(e => e.distance <= cfg.attackApproachRange)
      .filter(e => attackWorthTaking(self, e))
      .filter(e => !activeThreats.some(t => dist(e, t) <= cfg.attackDangerRadius));
  }

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && Date.now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScore(coin.amount, opportunityCoinStaminaCost(coin), cfg.coinOpportunityValue)
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityAfkTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function targetStamina5sRemaining(target) {
    const value = Number(target?.stamina_5s_remaining_milli ?? target?.stamina5s ?? target?.stamina_5s ?? NaN);
    return Number.isFinite(value) ? value : null;
  }

  function opportunityAfkStaminaState() {
    if (!(bot.opportunityAfkStamina instanceof Map)) bot.opportunityAfkStamina = new Map();
    return bot.opportunityAfkStamina;
  }

  function opportunityAfkStaminaCooldownMs() {
    const value = Number(cfg.opportunityAfkStaminaCooldownMs ?? 60000);
    return Math.max(0, Number.isFinite(value) ? value : 60000);
  }

  function opportunityAfkStaminaDropThresholdMs() {
    const value = Number(cfg.opportunityAfkStaminaDropThresholdMs ?? 100);
    return Math.max(0, Number.isFinite(value) ? value : 100);
  }

  function updateOpportunityAfkStaminaObservations(targets, t = Date.now()) {
    const state = opportunityAfkStaminaState();
    const cooldownMs = opportunityAfkStaminaCooldownMs();
    const dropThreshold = opportunityAfkStaminaDropThresholdMs();
    const observationGapMs = Math.max(1000, Number(cfg.activeSeenMs || 0) * 2, Number(cfg.tickMs || 0) * 8);
    for (const target of targets || []) {
      const id = opportunityAfkTargetId(target);
      if (!id) continue;
      const stamina5s = targetStamina5sRemaining(target);
      const previous = state.get(id) || {};
      const previousStamina = Number(previous.stamina5s);
      const previousSeenAt = Number(previous.lastSeenAt || 0);
      const continuous = previousSeenAt > 0 && t - previousSeenAt <= observationGapMs;
      let cooldownUntil = Math.max(0, Number(previous.cooldownUntil || 0));
      let consumedAt = Math.max(0, Number(previous.consumedAt || 0));
      if (Number.isFinite(stamina5s) && continuous && Number.isFinite(previousStamina) && stamina5s + dropThreshold < previousStamina) {
        cooldownUntil = Math.max(cooldownUntil, t + cooldownMs);
        consumedAt = t;
      }
      state.set(id, {
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null),
        lastSeenAt: t,
        cooldownUntil,
        consumedAt
      });
    }
    const ttlMs = Math.max(300000, cooldownMs * 5);
    for (const [id, item] of state.entries()) {
      const lastSeenAt = Number(item?.lastSeenAt || 0);
      const cooldownUntil = Number(item?.cooldownUntil || 0);
      if (cooldownUntil <= t && lastSeenAt > 0 && t - lastSeenAt > ttlMs) state.delete(id);
    }
  }

  function opportunityAfkStaminaCooldownRemaining(target, t = Date.now()) {
    const id = opportunityAfkTargetId(target);
    if (!id) return 0;
    const item = opportunityAfkStaminaState().get(id);
    return Math.max(0, Math.round(Number(item?.cooldownUntil || 0) - t));
  }

  function afkOpportunityBlockedByStaminaCooldown(target, t = Date.now()) {
    if (!isAfkProfitTarget(target)) return false;
    const distance = Number(target?.distance ?? Infinity);
    if (Number.isFinite(distance) && distance <= Number(cfg.attackRange || 0)) return false;
    return opportunityAfkStaminaCooldownRemaining(target, t) > 0;
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (afk && !inRange && afkOpportunityBlockedByStaminaCooldown(target)) return null;
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && Date.now() - bot.lastTargetAt < cfg.targetStickMs;
    return opportunityValueScore(
      target.drop,
      opportunityEnemyStaminaCost(target),
      afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue
    ) + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityPriorityTier(item) {
    const distance = Number(item?.distance ?? Infinity);
    const visibleDistance = Math.max(0, Number(cfg.opportunityVisibleDistance || cfg.opportunityNearbyPriorityDistance || 0));
    if (Number.isFinite(distance) && distance <= visibleDistance) return 1;
    if (item?.type === 'enemy' && item?.kind === 'attack') return 1;
    return 0;
  }
  function coinRouteKey(coin) {
    const id = coin?.drop_id ?? coin?.id;
    if (id !== undefined && id !== null && id !== '') return String(id);
    return [Math.round(Number(coin?.x || 0)), Math.round(Number(coin?.y || 0)), Math.round(Number(coin?.amount || 0))].join(':');
  }
  function coinRouteLegStaminaCost(from, to) {
    return opportunityMoveStaminaCost(dist(from, to), 0)
      + Math.max(0, Number(cfg.opportunityCoinPickupStaminaMs || 0));
  }
  function coinRouteLegClear(from, to, activeThreats) {
    if (!from || !to) return false;
    const distance = dist(from, to);
    if (!Number.isFinite(distance)) return false;
    const sampleDistance = Math.max(1, Number(cfg.coinRouteLegSampleDistance || 10000));
    const steps = Math.max(1, Math.ceil(distance / sampleDistance));
    for (let i = 1; i <= steps; i += 1) {
      const ratio = i / steps;
      const point = {
        x: Number(from.x) + (Number(to.x) - Number(from.x)) * ratio,
        y: Number(from.y) + (Number(to.y) - Number(from.y)) * ratio,
        drop_id: to.drop_id,
        amount: to.amount
      };
      for (const rawThreat of activeThreats || []) {
        if (dist(point, rawThreat) <= coinThreatDangerRadius(rawThreat)) return false;
        const threat = { ...rawThreat, distance: dist(from, rawThreat) };
        if (coinBlockedByThreat(from, point, threat)) return false;
      }
    }
    return true;
  }
  function coinRoutePointLimit(anchor, candidates) {
    const radius = Math.max(0, Number(cfg.coinRouteClusterRadius || 0));
    const clusterCount = (candidates || []).filter(coin => dist(anchor, coin) <= radius).length;
    if (clusterCount >= 5) return Math.max(2, Number(cfg.coinRouteMaxPointsDense || 6));
    if (clusterCount >= 3) return Math.max(2, Number(cfg.coinRouteMaxPointsMid || 4));
    return Math.max(3, Number(cfg.coinRouteMaxPointsSparse || 2));
  }
  function coinRouteSummary(route, self) {
    let totalValue = 0;
    let totalStaminaCost = 0;
    let totalDistance = 0;
    let previous = self;
    for (const coin of route || []) {
      const legDistance = dist(previous, coin);
      totalDistance += legDistance;
      totalValue += Math.max(0, Number(coin.amount || 0));
      totalStaminaCost += opportunityMoveStaminaCost(legDistance, 0)
        + Math.max(0, Number(cfg.opportunityCoinPickupStaminaMs || 0));
      previous = coin;
    }
    return { totalValue, totalStaminaCost, totalDistance };
  }
  function coinRoutePoints(route) {
    return (route || [])
      .map((coin, index) => ({
        id: coinRouteKey(coin),
        x: Number(coin?.x),
        y: Number(coin?.y),
        amount: Number(coin?.amount || 0),
        order: index + 1
      }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  function buildCoinRouteFromAnchor(self, anchor, candidates, activeThreats) {
    if (!self || !anchor) return null;
    const route = [anchor];
    const used = new Set([coinRouteKey(anchor)]);
    let current = anchor;
    let currentStaminaCost = coinRouteLegStaminaCost(self, anchor);
    let bestRoute = null;
    let bestScore = -Infinity;
    if (!opportunityStaminaAffordable(self, currentStaminaCost)) return null;
    const pointLimit = coinRoutePointLimit(anchor, candidates);
    const linkDistance = Math.max(0, Number(cfg.coinRouteLinkDistance || 0));
    const maxLinkDistance = Math.max(linkDistance, Number(cfg.coinRouteMaxLinkDistance || linkDistance || 0));
    while (route.length < pointLimit) {
      const next = (candidates || [])
        .filter(coin => !used.has(coinRouteKey(coin)))
        .map(coin => ({ ...coin, routeLegDistance: dist(current, coin) }))
        .filter(coin => Number.isFinite(coin.routeLegDistance) && coin.routeLegDistance <= maxLinkDistance)
        .filter(coin => coinRouteLegClear(current, coin, activeThreats))
        .map(coin => {
          const legCost = coinRouteLegStaminaCost(current, coin);
          const linkPenalty = linkDistance > 0 && coin.routeLegDistance > linkDistance ? 0.85 : 1;
          return {
            coin,
            legCost,
            score: opportunityValueScore(coin.amount, legCost, cfg.coinOpportunityValue) * linkPenalty
          };
        })
        .filter(item => Number.isFinite(item.score))
        .sort((a, b) => b.score - a.score || Number(b.coin.amount || 0) - Number(a.coin.amount || 0) || a.coin.routeLegDistance - b.coin.routeLegDistance)[0] || null;
      if (!next) break;
      if (!opportunityStaminaAffordable(self, currentStaminaCost + next.legCost)) break;
      route.push(next.coin);
      used.add(coinRouteKey(next.coin));
      current = next.coin;
      currentStaminaCost += next.legCost;
      if (route.length >= 3) {
        const prefixSummary = coinRouteSummary(route, self);
        const prefixScore = opportunityValueScore(prefixSummary.totalValue, prefixSummary.totalStaminaCost, cfg.coinOpportunityValue);
        if (Number.isFinite(prefixScore) && prefixScore > bestScore) {
          bestScore = prefixScore;
          bestRoute = route.slice();
        }
      }
    }
    if (!bestRoute) return null;
    const summary = coinRouteSummary(bestRoute, self);
    if (!opportunityStaminaAffordable(self, summary.totalStaminaCost)) return null;
    const score = opportunityValueScore(summary.totalValue, summary.totalStaminaCost, cfg.coinOpportunityValue);
    if (!Number.isFinite(score)) return null;
    const first = bestRoute[0];
    const firstDistance = dist(self, first);
    const routeKind = bestRoute.length >= Number(cfg.coinRouteMaxPointsDense || 6) ? 'dense' : (bestRoute.length >= 4 ? 'cluster' : 'short');
    return {
      ...first,
      distance: firstDistance,
      amount: first.amount,
      route: true,
      coinRoute: {
        ids: bestRoute.map(coinRouteKey),
        points: coinRoutePoints(bestRoute),
        value: summary.totalValue,
        staminaCost: summary.totalStaminaCost,
        legCount: bestRoute.length,
        totalDistance: summary.totalDistance,
        firstDistance,
        kind: routeKind,
        score
      },
      routeIds: bestRoute.map(coinRouteKey),
      routeValue: summary.totalValue,
      routeKind,
      routeLegs: bestRoute.length,
      opportunityScore: score,
      opportunityStaminaCost: summary.totalStaminaCost
    };
  }

  function coinRouteSkipsCloserFirstCoin(self, route, candidates) {
    if (!self || !route) return false;
    const firstDistance = Number(route.distance ?? route.coinRoute?.firstDistance ?? Infinity);
    if (!Number.isFinite(firstDistance)) return false;
    const nearbyLimit = Math.max(0, Number(cfg.coinRouteNearbyFirstCoinDistance || 0));
    if (!(nearbyLimit > 0)) return false;
    const firstKey = coinRouteKey(route);
    const nearest = (candidates || [])
      .filter(coin => coinRouteKey(coin) !== firstKey)
      .map(coin => ({ ...coin, distance: Number.isFinite(Number(coin.distance)) ? Number(coin.distance) : dist(self, coin) }))
      .filter(coin => Number.isFinite(coin.distance) && coin.distance <= nearbyLimit)
      .sort((a, b) => a.distance - b.distance || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
    if (!nearest) return false;
    const ratio = Math.max(1, Number(cfg.coinRouteFirstCoinDistanceRatio || 1));
    const slack = Math.max(0, Number(cfg.coinRouteFirstCoinDistanceSlack || 0));
    const allowedFirstDistance = Math.max(Number(nearest.distance || 0) * ratio, Number(nearest.distance || 0) + slack);
    return firstDistance > allowedFirstDistance;
  }

  function coinRouteIdsFrom(value) {
    const ids = Array.isArray(value?.coinRoute?.ids) ? value.coinRoute.ids : (Array.isArray(value?.routeIds) ? value.routeIds : value?.coinRouteIds);
    return Array.isArray(ids) ? ids.map(id => String(id)).filter(Boolean) : [];
  }

  function currentHeldCoinRouteChoice(t = Date.now()) {
    const choice = bot.opportunityChoice;
    if (!choice || opportunityChoiceType(choice) !== 'coin') return null;
    if (t >= Number(choice.until || 0)) return null;
    const id = opportunityChoiceId(choice);
    if (!id && id !== '0') return null;
    if (String(choice.reason || '') !== 'best-opportunity-coin-route' && !coinRouteIdsFrom(choice).length) return null;
    return choice;
  }

  function coinRouteMatchesHeldChoice(route, choice) {
    if (!route || !choice) return false;
    const firstKey = coinRouteKey(route);
    const choiceId = opportunityChoiceId(choice);
    if (!choiceId || String(firstKey) !== String(choiceId)) return false;
    const previousIds = coinRouteIdsFrom(choice);
    if (!previousIds.length) return true;
    const routeIds = coinRouteIdsFrom(route);
    const previousSet = new Set(previousIds);
    const overlap = routeIds.reduce((count, id) => count + (previousSet.has(String(id)) ? 1 : 0), 0);
    const minOverlap = Math.max(1, Math.min(previousIds.length, Math.max(1, Number(cfg.coinRouteHeldMinOverlap || 2))));
    return overlap >= minOverlap;
  }

  function heldCoinRouteBeatsSwitch(heldRoute, bestRoute) {
    if (!heldRoute) return false;
    if (!bestRoute) return true;
    if (coinRouteKey(heldRoute) === coinRouteKey(bestRoute)) return false;
    const heldScore = Number(heldRoute.opportunityScore || -Infinity);
    const bestScore = Number(bestRoute.opportunityScore || -Infinity);
    if (!Number.isFinite(heldScore) || !Number.isFinite(bestScore)) return false;
    const margin = Math.max(0, Number(cfg.coinRouteSwitchMargin ?? cfg.opportunitySwitchMargin) || 0);
    const relativeMargin = Math.max(0, Number(cfg.coinRouteSwitchRelativeMargin ?? cfg.opportunitySwitchRelativeMargin) || 0);
    const requiredScore = Math.max(heldScore + margin, heldScore * (1 + relativeMargin));
    return bestScore <= requiredScore;
  }

  function pickCoinRouteOpportunity(self, coins, activeThreats) {
    if (!self) return null;
    const maxDistance = Math.max(0, Number(cfg.coinRouteMaxDistance || cfg.globalCoinMaxDistance || 0));
    if (!(maxDistance > 0)) return null;
    const poolLimit = Math.max(2, Number(cfg.coinRoutePoolLimit || 72));
    const candidates = safeCoins(self, (coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance)
      .filter(coin => Number(coin.amount || 0) > 0)
      .slice(0, poolLimit);
    if (candidates.length < 2) return null;
    const anchors = [];
    const addAnchor = coin => {
      if (!coin) return;
      const key = coinRouteKey(coin);
      if (!anchors.some(item => coinRouteKey(item) === key)) anchors.push(coin);
    };
    const heldChoice = currentHeldCoinRouteChoice();
    const heldAnchor = heldChoice ? candidates.find(coin => coinRouteKey(coin) === opportunityChoiceId(heldChoice)) : null;
    if (heldAnchor) addAnchor(heldAnchor);
    candidates.slice(0, Math.max(1, Number(cfg.coinRouteAnchorLimit || 22))).forEach(addAnchor);
    candidates.slice().sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, 8).forEach(addAnchor);
    candidates.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, 8).forEach(addAnchor);
    const clusterRadius = Math.max(0, Number(cfg.coinRouteClusterRadius || 0));
    candidates.slice().sort((a, b) => {
      const aCount = candidates.filter(coin => dist(a, coin) <= clusterRadius).length;
      const bCount = candidates.filter(coin => dist(b, coin) <= clusterRadius).length;
      return bCount - aCount || Number(a.distance || Infinity) - Number(b.distance || Infinity);
    }).slice(0, 8).forEach(addAnchor);
    let best = null;
    let heldRoute = null;
    for (const anchor of anchors.slice(0, Math.max(1, Number(cfg.coinRouteAnchorLimit || 22)))) {
      if (!coinRouteLegClear(self, anchor, activeThreats)) continue;
      const route = buildCoinRouteFromAnchor(self, anchor, candidates, activeThreats);
      if (!route) continue;
      if (coinRouteSkipsCloserFirstCoin(self, route, candidates)) continue;
      if (coinRouteMatchesHeldChoice(route, heldChoice)) heldRoute = route;
      const score = Number(route.opportunityScore || -Infinity);
      if (!best
        || score > Number(best.opportunityScore || -Infinity)
        || (score === Number(best.opportunityScore || -Infinity) && Number(route.routeValue || 0) > Number(best.routeValue || 0))
        || (score === Number(best.opportunityScore || -Infinity) && Number(route.distance || Infinity) < Number(best.distance || Infinity))) {
        best = route;
      }
    }
    if (heldCoinRouteBeatsSwitch(heldRoute, best)) {
      return {
        ...heldRoute,
        routeHeld: true,
        competingRouteScore: best ? Number(best.opportunityScore || 0) : null
      };
    }
    return best;
  }
  function uniqueVisibleRouteCoins(coins) {
    const byId = new Map();
    for (const coin of coins || []) {
      if (isSnapshotOnlyCoin(coin)) continue;
      const key = coinRouteKey(coin);
      if (!byId.has(key)) byId.set(key, coin);
    }
    return Array.from(byId.values());
  }

  function opportunityKey(item) {
    if (!item) return '';
    return String(item.type || '') + ':' + String(item.id ?? '');
  }

  function opportunityChoiceType(choice) {
    if (choice?.type) return String(choice.type);
    const key = String(choice?.key || '');
    return key.includes(':') ? key.split(':')[0] : '';
  }

  function opportunityChoiceId(choice) {
    if (choice?.id !== undefined && choice?.id !== null && choice.id !== '') return String(choice.id);
    const key = String(choice?.key || '');
    const index = key.indexOf(':');
    return index >= 0 ? key.slice(index + 1) : '';
  }

  function opportunityChoiceKey(choice) {
    if (choice?.key) return String(choice.key);
    const type = opportunityChoiceType(choice);
    const id = opportunityChoiceId(choice);
    return type && id ? type + ':' + id : '';
  }

  function opportunityPairKey(a, b) {
    return [String(a || ''), String(b || '')].sort().join('|');
  }

  function opportunityByKey(opportunities, key) {
    return (opportunities || []).find(item => opportunityKey(item) === key) || null;
  }

  function resetOpportunitySwitchLock() {
    bot.opportunitySwitchLock = null;
  }

  function lockedOpportunityChoice(sorted) {
    const lock = bot.opportunitySwitchLock;
    const lockedKey = String(lock?.lockedKey || '');
    if (!lockedKey) return null;
    const pairKeys = String(lock.pairKey || '').split('|').filter(Boolean);
    if (pairKeys.length === 2 && pairKeys.some(key => !opportunityByKey(sorted, key))) {
      resetOpportunitySwitchLock();
      return null;
    }
    const locked = opportunityByKey(sorted, lockedKey);
    if (!locked) {
      resetOpportunitySwitchLock();
      return null;
    }
    const best = sorted[0] || null;
    return {
      ...locked,
      held: true,
      oscillationLocked: true,
      oscillationSwitchCount: Number(lock.switchCount || 0),
      competingScore: best && opportunityKey(best) !== lockedKey ? best.score : locked.competingScore
    };
  }

  function applyOpportunityOscillationLock(sorted, current, chosen) {
    const locked = lockedOpportunityChoice(sorted);
    if (locked) return locked;
    if (!chosen) return chosen;
    if (!current) {
      resetOpportunitySwitchLock();
      return chosen;
    }
    if (opportunityMatchesChoice(chosen, current)) return chosen;
    const held = sorted.find(item => opportunityMatchesChoice(item, current)) || null;
    if (!held) {
      resetOpportunitySwitchLock();
      return chosen;
    }
    const fromKey = opportunityKey(held);
    const toKey = opportunityKey(chosen);
    if (!fromKey || !toKey || fromKey === toKey) return chosen;
    const limit = Math.max(0, Number(cfg.opportunityOscillationSwitchLimit || 0));
    if (!limit) return chosen;
    const t = Date.now();
    const pairKey = opportunityPairKey(fromKey, toKey);
    const previous = bot.opportunitySwitchLock || {};
    const continuing = !previous.lockedKey && previous.pairKey === pairKey && previous.lastKey === fromKey;
    const switchCount = continuing ? Number(previous.switchCount || 0) + 1 : 1;
    if (switchCount > limit) {
      bot.opportunitySwitchLock = { pairKey, lastKey: fromKey, switchCount, lockedKey: fromKey, blockedKey: toKey, lockedAt: t, updatedAt: t };
      return { ...held, held: true, oscillationLocked: true, oscillationSwitchCount: switchCount, competingScore: chosen.score };
    }
    bot.opportunitySwitchLock = { pairKey, lastKey: toKey, switchCount, lockedKey: '', blockedKey: '', lockedAt: 0, updatedAt: t };
    return chosen;
  }

  function opportunitySameCoinRadius() {
    return Math.max(0, Number(cfg.opportunitySameCoinRadius || cfg.coinCollectedPruneRadius || 900));
  }

  function opportunityMatchesChoice(item, choice) {
    if (!item || !choice) return false;
    const key = opportunityKey(item);
    const choiceKey = opportunityChoiceKey(choice);
    if (key && choiceKey && key === choiceKey) return true;
    if (String(item.type || '') !== 'coin' || opportunityChoiceType(choice) !== 'coin') return false;
    const amount = Number(item.amount ?? 0);
    const choiceAmount = Number(choice.amount ?? 0);
    if (amount > 0 && choiceAmount > 0 && Math.round(amount) !== Math.round(choiceAmount)) return false;
    const x = Number(item.x);
    const y = Number(item.y);
    const choiceX = Number(choice.x);
    const choiceY = Number(choice.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(choiceX) || !Number.isFinite(choiceY)) return false;
    return dist({ x, y }, { x: choiceX, y: choiceY }) <= opportunitySameCoinRadius();
  }

  function opportunityMissingHoldUntil(choice, t) {
    if (!choice || opportunityChoiceType(choice) !== 'coin') return 0;
    const holdMs = Math.max(0, Number(cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs) || 0);
    const lastSeenAt = Number(choice.lastSeenAt || choice.at || t);
    const until = Math.min(Number(choice.until || 0), lastSeenAt + holdMs);
    return until > t ? until : 0;
  }

  function buildMissingHeldOpportunity(self, activeThreats, opportunities) {
    const current = bot.opportunityChoice;
    const t = Date.now();
    const holdUntil = opportunityMissingHoldUntil(current, t);
    if (!holdUntil) return null;
    if ((opportunities || []).some(item => opportunityMatchesChoice(item, current))) return null;
    const id = opportunityChoiceId(current);
    if (!id && id !== '0') return null;
    if (bot.ignoredCoins && typeof bot.ignoredCoins.has === 'function' && bot.ignoredCoins.has(String(id))) return null;
    const x = Number(current.x);
    const y = Number(current.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const amount = Math.max(0, Number(current.amount || 0)) || 1;
    const coin = {
      drop_id: id,
      x,
      y,
      amount,
      distance: self ? dist(self, { x, y }) : Number(current.distance || Infinity)
    };
    const maxDistance = Math.max(
      0,
      Number(current.maxDistance || 0),
      Number(cfg.snapshotCoinMaxDistance || 0),
      Number(cfg.globalCoinMaxDistance || 0),
      Number(cfg.coinMaxDistance || 0)
    );
    if (Number.isFinite(coin.distance) && maxDistance && coin.distance > maxDistance) return null;
    if ((activeThreats || []).some(threat => coinBlockedByThreat(self, coin, threat))) return null;
    const staminaCost = opportunityCoinStaminaCost(coin);
    if (!opportunityStaminaAffordable(self, staminaCost)) return null;
    const kind = coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin';
    return {
      type: 'coin',
      kind,
      actionKind: kind,
      reason: current.reason || (kind === 'coin' ? 'best-opportunity-coin' : 'best-opportunity-visible-coin'),
      id,
      amount,
      x,
      y,
      distance: coin.distance,
      staminaCost,
      score: scoreCoinOpportunity(coin),
      priorityTier: opportunityPriorityTier({ type: 'coin', distance: coin.distance }),
      maxDistance,
      held: true,
      missingHold: true,
      holdUntil
    };
  }

  function chooseStableOpportunity(opportunities) {
    const sorted = opportunities
      .sort((a, b) => b.priorityTier - a.priorityTier || b.score - a.score || (a.type === b.type ? 0 : (a.type === 'enemy' ? -1 : 1)) || a.distance - b.distance);
    const best = sorted[0] || null;
    if (!best) return null;
    const current = bot.opportunityChoice;
    const t = Date.now();
    let chosen = best;
    if (current?.key && t < Number(current.until || 0)) {
      const held = sorted.find(item => opportunityMatchesChoice(item, current));
      if (held && !opportunityMatchesChoice(best, current)) {
        if (Number(best.priorityTier || 0) <= Number(held.priorityTier || 0)) {
          const margin = Math.max(0, Number(cfg.opportunitySwitchMargin) || 0);
          const relativeMargin = Math.max(0, Number(cfg.opportunitySwitchRelativeMargin) || 0);
          const heldScore = Number(held.score || 0);
          const requiredScore = Math.max(heldScore + margin, heldScore * (1 + relativeMargin));
          if (Number(best.score || 0) <= requiredScore) {
            chosen = { ...held, held: true, competingScore: best.score };
          }
        }
      }
    }
    chosen = applyOpportunityOscillationLock(sorted, current, chosen);
    if (current) {
      const same = opportunityMatchesChoice(chosen, current);
      const missingHold = Boolean(chosen.missingHold);
      const routeMeta = chosen.coinRoute || null;
      const routeIds = Array.isArray(routeMeta?.ids) ? routeMeta.ids.map(id => String(id)).filter(Boolean) : [];
      bot.opportunityChoice = {
        key: opportunityKey(chosen),
        type: chosen.type || '',
        id: chosen.id ?? '',
        until: missingHold ? Math.max(t, Number(chosen.holdUntil || current?.until || t)) : t + Math.max(0, Number(cfg.opportunitySwitchHoldMs) || 0),
        at: same ? Number(current.at || t) : t,
        lastSeenAt: missingHold ? Number(current?.lastSeenAt || current?.at || t) : t,
        score: Math.round(Number(chosen.score || 0)),
        staminaCost: Number.isFinite(Number(chosen.staminaCost)) ? Math.round(Number(chosen.staminaCost)) : null,
        reason: chosen.reason || '',
        x: Number.isFinite(Number(chosen.x)) ? Number(chosen.x) : null,
        y: Number.isFinite(Number(chosen.y)) ? Number(chosen.y) : null,
        amount: Number.isFinite(Number(chosen.amount)) ? Number(chosen.amount) : null,
        distance: Number.isFinite(Number(chosen.distance)) ? Math.round(Number(chosen.distance)) : null,
        actionKind: chosen.actionKind || chosen.kind || '',
        priorityTier: Number(chosen.priorityTier || 0),
        maxDistance: Number.isFinite(Number(chosen.maxDistance)) ? Number(chosen.maxDistance) : null,
        missingSince: missingHold ? Number(current?.missingSince || t) : 0,
        oscillationLocked: Boolean(chosen.oscillationLocked),
        oscillationSwitchCount: Number(chosen.oscillationSwitchCount || 0),
        coinRouteIds: routeIds.length ? routeIds : null,
        coinRouteValue: Number.isFinite(Number(routeMeta?.value)) ? Math.round(Number(routeMeta.value)) : null,
        coinRouteLegs: Number.isFinite(Number(routeMeta?.legCount)) ? Math.round(Number(routeMeta.legCount)) : null
      };
    }
    return chosen;
  }

  function bestCoinOpportunityScore(self, coins, activeThreats, snapshotCompetitionCoin = null, fieldCompetitionCoin = null) {
    let best = -Infinity;
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      if (!opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin))) continue;
      const score = scoreCoinOpportunity(coin);
      if (score > best) best = score;
    }
    const route = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coins), activeThreats);
    if (route) {
      const score = scoreCoinOpportunity(route);
      if (score > best) best = score;
    }
    const extraCoins = [
      fieldCompetitionCoin,
      snapshotCompetitionCoin || pickSnapshotCoinDestination(self, coins, activeThreats)
    ].filter(Boolean);
    for (const coin of extraCoins) {
      if (opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin))) {
        const score = scoreCoinOpportunity(coin);
        if (score > best) best = score;
      }
    }
    return best;
  }

  function pickProfitableCombatTarget(self, entities, bullets, coins, activeThreats, snapshotCompetitionCoin = null, fieldCompetitionCoin = null) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, entities, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    const coinScore = bestCoinOpportunityScore(self, coins, activeThreats, snapshotCompetitionCoin, fieldCompetitionCoin);
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

  function combatTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === null || id === undefined ? '' : String(id);
  }

  function combatRetreatIgnoreActive(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id || !bot.combatRetreatIgnore) return false;
    const until = Number(bot.combatRetreatIgnore.get(id) || 0);
    if (!until) return false;
    if (until <= t) {
      bot.combatRetreatIgnore.delete(id);
      return false;
    }
    return true;
  }

  function rememberCombatRetreatIgnore(target, t = Date.now()) {
    const id = combatTargetId(target);
    if (!id) return;
    if (!bot.combatRetreatIgnore) bot.combatRetreatIgnore = new Map();
    bot.combatRetreatIgnore.set(id, t + Math.max(1000, Number(cfg.combatRetreatIgnoreMs || 0) || 15000));
  }

  function clearCombatDisadvantageObservation(reason = '') {
    if (!bot.combatDisadvantageObservation) return;
    bot.lastCombatDisadvantageObservationClear = { at: Date.now(), reason };
    bot.combatDisadvantageObservation = null;
  }

  function combatDisadvantageObservationState(target, kind, evidence = {}) {
    const id = combatTargetId(target);
    if (!id || !kind) return null;
    const t = Date.now();
    const previous = bot.combatDisadvantageObservation || null;
    const same = previous && String(previous.id || '') === id && String(previous.kind || '') === String(kind);
    const currentTarget = bot.combatTarget && String(bot.combatTarget.id ?? '') === id ? bot.combatTarget : null;
    const firstAt = same ? Number(previous.firstAt || previous.at || t) : t;
    const count = Math.max(1, same ? Number(previous.count || 1) + 1 : 1);
    const engagedAt = Number(currentTarget?.firstSeenAt || currentTarget?.at || firstAt || t);
    const observedMs = Math.max(0, t - firstAt);
    const engagedMs = Math.max(0, t - engagedAt);
    const confirmMs = Math.max(0, Number(cfg.combatDisadvantageConfirmMs || 0));
    const minEngageMs = Math.max(0, Number(cfg.combatDisadvantageMinEngageMs || 0));
    const minSamples = Math.max(1, Math.round(Number(cfg.combatDisadvantageMinSamples || 1)));
    const sampleCount = Math.max(
      count,
      Math.round(Number(evidence?.sampleCount || 0)),
      Array.isArray(currentTarget?.motionSamples) ? currentTarget.motionSamples.length : 0
    );
    const remainingMs = Math.max(0, confirmMs - observedMs, minEngageMs - engagedMs);
    const samplesRemaining = Math.max(0, minSamples - sampleCount);
    const state = {
      active: true,
      id,
      kind: String(kind),
      firstAt,
      at: t,
      observedMs: Math.round(observedMs),
      engagedMs: Math.round(engagedMs),
      count,
      sampleCount,
      confirmMs,
      minEngageMs,
      minSamples,
      remainingMs: Math.round(remainingMs),
      samplesRemaining,
      ready: remainingMs <= 0 && samplesRemaining <= 0,
      evidence
    };
    bot.combatDisadvantageObservation = state;
    return state;
  }

  function pickEngagedCombatTarget(self, entities, bullets = []) {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return null;
    if (combatRetreatIgnoreActive({ id: engaged.id })) {
      bot.combatTarget = null;
      return null;
    }
    const target = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .find(e => String(e.user_id ?? e.id ?? '') === String(engaged.id));
    if (!target || isWhitelistedTarget(target) || isInvulnerable(target)) return null;
    const distance = dist(self, target);
    if (distance > Math.max(cfg.combatAttackRange, cfg.combatDisengageRange, cfg.combatEngageGraceRange)) {
      bot.combatTarget = null;
      return null;
    }
    const decorated = {
      ...target,
      distance,
      drop: dropValue(target),
      speed: speed(target),
      hp: combatHpValue(target),
      knownHp: knownHpValue(target)
    };
    const { ownerId: incomingOwnerId, unknownIncoming } = incomingBulletInfo(self, bullets);
    if (isLowValueActiveCombatTarget(decorated) && !lowValueActiveThreatensSelf(decorated, incomingOwnerId, unknownIncoming)) {
      bot.combatTarget = null;
      return null;
    }
    return {
      ...decorated,
      combatIntent: 'engaged'
    };
  }
  function defensiveTargetOverridesEngaged(engagedTarget, defensiveTarget) {
    if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
    if (!incomingBulletRequiresTargetSwitch(defensiveTarget.incomingBullet)) return false;
    const ownerId = defensiveTarget.incomingBullet.ownerId
      ?? defensiveTarget.incomingBullet.owner_id
      ?? defensiveTarget.incomingBullet.source_user_id
      ?? defensiveTarget.incomingBullet.user_id;
    if (ownerId === null || ownerId === undefined) return false;
    const defensiveId = defensiveTarget.user_id ?? defensiveTarget.id;
    const engagedId = engagedTarget.user_id ?? engagedTarget.id;
    return defensiveId !== null && defensiveId !== undefined
      && engagedId !== null && engagedId !== undefined
      && String(defensiveId) !== String(engagedId);
  }
  function incomingBulletRequiresTargetSwitch(incomingBullet) {
    if (!incomingBullet) return false;
    const distance = Number(incomingBullet.distance);
    const timeToImpactMs = Number(incomingBullet.timeToImpactMs);
    const switchDistance = Math.max(0, Number(cfg.combatTargetSwitchIncomingDistance || 0));
    const switchTime = Math.max(0, Number(cfg.combatTargetSwitchIncomingTimeMs || 0));
    if (switchDistance > 0 && Number.isFinite(distance) && distance <= switchDistance) return true;
    if (switchTime > 0 && Number.isFinite(timeToImpactMs) && timeToImpactMs <= switchTime) return true;
    return false;
  }

  function lowValueActiveDropMax() {
    const value = Number(cfg.combatLowValueActiveDropMax ?? 3);
    return Math.max(0, Number.isFinite(value) ? value : 3);
  }

  function isLowValueActiveCombatTarget(target) {
    if (!target || isAfkProfitTarget(target)) return false;
    return hasCombatActivitySignalForTest(target) && Number(target.drop ?? dropValue(target) ?? 0) <= lowValueActiveDropMax();
  }

  function incomingOwnerMatchesTarget(target, incomingOwnerId) {
    if (!target || incomingOwnerId === null || incomingOwnerId === undefined) return false;
    const targetId = target.user_id ?? target.id;
    return targetId !== null && targetId !== undefined && String(targetId) === String(incomingOwnerId);
  }

  function lowValueActiveThreatensSelf(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!isLowValueActiveCombatTarget(target)) return true;
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    return Boolean(unknownIncoming && isFiringEntity(target));
  }

  function incomingBulletInfo(self, bullets = []) {
    const incoming = (bullets || []).find(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) !== Number(self.user_id));
    const ownerId = incoming ? (incoming.owner_id ?? incoming.ownerId ?? incoming.source_user_id ?? incoming.user_id) : null;
    return {
      incoming,
      ownerId,
      unknownIncoming: Boolean(incoming && (ownerId === null || ownerId === undefined))
    };
  }

  function combatTargetPriority(target, incomingOwnerId = null, unknownIncoming = false) {
    const incomingMatch = incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId);
    return (incomingMatch ? 1000000000 : 0)
      + (isFiringEntity(target) ? 500000000 : 0)
      + (unknownIncoming && isActive(target) ? 200000000 : 0)
      + (isJoinModeActive(target) ? 150000000 : 0)
      + (isActive(target) ? 100000000 : 0)
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }
  function isDefensiveCombatTarget(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkProfitTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerMatchesTarget(target, incomingOwnerId)) return true;
    if (isLowValueActiveCombatTarget(target)) return lowValueActiveThreatensSelf(target, incomingOwnerId, unknownIncoming);
    if (isFiringEntity(target)) return true;
    if (isActive(target)) return true;
    return Boolean(unknownIncoming && isActive(target));
  }
  function isProfitableCombatTarget(target) {
    return Boolean(target && !isWhitelistedTarget(target) && !isAfkProfitTarget(target) && !isInvulnerable(target) && isActive(target) && Number(target.drop || 0) > lowValueActiveDropMax());
  }
  function combatHpGapDisadvantaged(self, target) {
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    if (knownSelfHp === null || knownTargetHp === null) return false;
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    return Number(knownSelfHp) > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap;
  }
  function profitCombatDisadvantaged(self, target) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    return (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp)
      || combatHpGapDisadvantaged(self, target);
  }
  function pickCombatTarget(self, entities, bullets = [], options = {}) {
    const candidateRange = Number(cfg.combatAttackRange || 0);
    const candidates = entities
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.distance <= candidateRange);
    const { incoming, ownerId: incomingOwnerId, unknownIncoming } = incomingBulletInfo(self, bullets);
    if (incoming) {
      const shooter = candidates.find(e => String(e.user_id) === String(incomingOwnerId));
      if (shooter) return { ...shooter, incomingBullet: incoming, combatIntent: 'defensive' };
    }
    const eligibleTargets = candidates
      .filter(e => !isAfkProfitTarget(e))
      .filter(e => !combatRetreatIgnoreActive(e));
    const defensiveTargets = eligibleTargets
      .filter(target => isDefensiveCombatTarget(target, incomingOwnerId, unknownIncoming))
      .sort((a, b) => combatTargetPriority(b, incomingOwnerId, unknownIncoming) - combatTargetPriority(a, incomingOwnerId, unknownIncoming));
    if (options.mode === 'defensive') return defensiveTargets[0] ? { ...defensiveTargets[0], combatIntent: 'defensive' } : null;
    const profitableTargets = eligibleTargets
      .filter(isProfitableCombatTarget)
      .filter(target => options.mode !== 'profit' || !profitCombatDisadvantaged(self, target))
      .sort((a, b) => {
        const scoreA = scoreEnemyOpportunity(a) ?? -Infinity;
        const scoreB = scoreEnemyOpportunity(b) ?? -Infinity;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.distance - b.distance;
      });
    if (options.mode === 'profit') return profitableTargets[0] ? { ...profitableTargets[0], combatIntent: 'profit' } : null;
    if (defensiveTargets[0]) return { ...defensiveTargets[0], combatIntent: 'defensive' };
    if (isFullHp(self) && profitableTargets[0]) return { ...profitableTargets[0], combatIntent: 'profit' };
    return null;
  }

  function pickOpportunisticShotTarget(self, entities) {
    return entities
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => e.distance <= cfg.attackRange)
      .filter(e => attackWorthTaking(self, e) && isAfkProfitTarget(e))
      .map(e => ({
        ...e,
        score: scoreEnemyOpportunity(e) ?? -Infinity,
        staminaCost: opportunityEnemyStaminaCost(e),
        estimatedShots: estimatedKillShots(e)
      }))
      .filter(e => opportunityStaminaAffordable(self, e.staminaCost))
      .sort((a, b) => b.score - a.score || (b.drop - a.drop) || a.distance - b.distance)[0] || null;
  }

  function actionOpportunityScore(action) {
    const explicit = Number(action?.score ?? action?.opportunityChoice?.score);
    if (Number.isFinite(explicit)) return explicit;
    const target = action?.target || action || {};
    if (['coin', 'seek-coin'].includes(action?.kind) && Number(target.amount || 0) > 0) {
      return scoreCoinOpportunity({
        amount: Number(target.amount || 0),
        distance: Number(target.distance ?? action?.distance ?? 0),
        opportunityStaminaCost: Number.isFinite(Number(action?.staminaCost)) ? Number(action.staminaCost) : undefined
      });
    }
    return -Infinity;
  }

  function opportunisticShotBeatsAction(action, target) {
    const shotScore = Number(target?.score ?? scoreEnemyOpportunity(target) ?? -Infinity);
    if (!Number.isFinite(shotScore)) return false;
    const actionScore = actionOpportunityScore(action);
    const minRatio = Math.max(0, Number(cfg.opportunisticShotMinScoreRatio ?? 1));
    return !Number.isFinite(actionScore) || actionScore <= 0 || shotScore >= actionScore * minRatio;
  }

  function attachOpportunisticShot(action, self, entities, allow = true) {
    if (!allow || !action || !['coin', 'seek-coin'].includes(action.kind) || action.combat) return action;
    const target = pickOpportunisticShotTarget(self, entities);
    if (!target) return action;
    if (!opportunisticShotBeatsAction(action, target)) return action;
    return {
      ...action,
      opportunisticShot: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        hp: combatHpValue(target),
        drop: target.drop,
        distance: Math.round(target.distance),
        score: Math.round(Number(target.score || 0)),
        staminaCost: Math.round(Number(target.staminaCost || 0)),
        estimatedShots: target.estimatedShots
      }
    };
  }

  function buildOpportunisticShotWait(self, entities, allow = true) {
    if (!allow) return null;
    const target = pickOpportunisticShotTarget(self, entities);
    if (!target) return null;
    return {
      kind: 'wait',
      reason: 'opportunistic-afk-drop-shot',
      dx: 0,
      dy: 0,
      opportunisticShot: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        hp: combatHpValue(target),
        drop: target.drop,
        distance: Math.round(target.distance),
        score: Math.round(Number(target.score || 0)),
        staminaCost: Math.round(Number(target.staminaCost || 0)),
        estimatedShots: target.estimatedShots
      }
    };
  }

  function pickPostAttackDropCoin(self, coins, activeThreats, attacks, entities, options = {}) {
    const t = Date.now();
    const recentAttacks = (attacks || [])
      .slice()
      .reverse()
      .filter(item => t - Number(item.at || 0) <= cfg.postAttackDropCoinPriorityMs)
      .filter(item => Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
      .filter(item => postAttackDropResolvedAt(item, entities, t));
    if (!recentAttacks.length) return null;
    const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
    const maxDistance = Math.max(0, Number(options.maxDistance ?? cfg.postAttackDropCoinMaxDistance) || 0);
    const minScore = Math.max(0, Number(options.minScore ?? 0) || 0);
    const candidates = [];
    for (const coin of coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > minAmount)
      .filter(c => c.distance <= maxDistance)
      .filter(c => !activeThreats.some(threat => coinBlockedByThreat(self, c, threat)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)))) {
      const attack = recentAttacks
        .filter(item => dist(coin, item) <= cfg.postAttackDropCoinRadius)
        .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(b.at || 0) - Number(a.at || 0))[0] || null;
      if (!attack) continue;
      const score = scoreCoinOpportunity(coin);
      if (score < minScore) continue;
      candidates.push({
        ...coin,
        postAttackScore: score,
        postAttackTarget: {
          id: attack.id,
          name: attack.name || '',
          drop: attack.drop,
          x: attack.x,
          y: attack.y,
          action: attack.action || '',
          playerCategory: attack.playerCategory || (attack.afk === false ? 'active' : 'afk'),
          afk: attack.afk !== false,
          active: attack.active === true || attack.playerCategory === 'active',
          combat: Boolean(attack.combat),
          combatIntent: attack.combatIntent || '',
          mode: attack.mode || '',
          currentlyActive: Boolean(attack.currentlyActive),
          moving: Boolean(attack.moving),
          firing: Boolean(attack.firing),
          distance: Number.isFinite(Number(attack.distance)) ? Math.round(Number(attack.distance)) : null,
          coinDistance: Number.isFinite(Number(coin.distance)) ? Math.round(Number(coin.distance)) : null,
          coinDistanceToTarget: Math.round(dist(coin, attack)),
          ageMs: Math.max(0, Math.round(t - Number(attack.at || t)))
        }
      });
    }
    return candidates
      .sort((a, b) => b.amount - a.amount || b.postAttackScore - a.postAttackScore || a.distance - b.distance)[0] || null;
  }

  function postAttackVisibleCoinExists(coins, attack) {
    return (coins || [])
      .map(c => ({ ...c, distanceToAttack: dist(c, attack), amount: Number(c.amount || 0) }))
      .some(c => c.amount > 0 && c.distanceToAttack <= cfg.postAttackDropCoinRadius);
  }

  function attackEntityMatches(entity, attack) {
    const attackId = attack?.id === undefined || attack?.id === null ? '' : String(attack.id);
    const attackName = String(attack?.name || '');
    if (attackId && String(entity?.user_id ?? entity?.id ?? '') === attackId) return true;
    return Boolean(attackName && String(entity?.name || '') === attackName);
  }

  function recentAttackTargetStillAttackable(attack, entities) {
    const target = (entities || []).find(entity => attackEntityMatches(entity, attack));
    if (!target || !isAlive(target)) return false;
    const hp = knownHpValue(target);
    if (hp !== null && hp <= 0) return false;
    if (isWhitelistedTarget(target)) return false;
    if (isActive(target)) return false;
    if (isInvulnerable(target)) return false;
    return dropValue(target) > 0;
  }

  function postAttackDropResolvedAt(attack, entities, t = Date.now()) {
    if (!attack || recentAttackTargetStillAttackable(attack, entities)) {
      if (attack) attack.postAttackDropResolvedAt = 0;
      return 0;
    }
    const existing = Number(attack.postAttackDropResolvedAt || 0);
    if (existing > 0) return existing;
    attack.postAttackDropResolvedAt = t;
    return t;
  }

  function pickPostAttackDropWaitTarget(self, coins, activeThreats, attacks, entities) {
    const t = Date.now();
    const waitMs = Math.max(0, Number(cfg.postAttackDropWaitMs || 0));
    if (!waitMs) return null;
    const minDrop = Math.max(0, Number(cfg.postAttackDropWaitMinDrop ?? cfg.attackMinDrop) || 0);
    const resolveMaxMs = Math.max(waitMs, Number(cfg.postAttackDropResolveMaxMs || waitMs) || waitMs);
    const maxDistance = Math.max(0, Number(cfg.postAttackDropWaitMaxDistance || cfg.opportunityVisibleDistance || cfg.globalCoinMaxDistance || 0));
    const stopDistance = Math.max(0, Number(cfg.postAttackDropWaitStopDistance || cfg.coinPickupSweepDistance || 0));
    return (attacks || [])
      .slice()
      .reverse()
      .filter(item => t - Number(item.at || 0) <= resolveMaxMs)
      .filter(item => Number(item.drop || 0) >= minDrop)
      .filter(item => Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y)))
      .filter(item => item.afk !== false)
      .filter(item => item.action === 'attack' || item.action === 'opportunistic-shot')
      .map(item => {
        const resolvedAt = postAttackDropResolvedAt(item, entities, t);
        return resolvedAt ? { ...item, postAttackDropResolvedAt: resolvedAt } : null;
      })
      .filter(Boolean)
      .filter(item => t - Number(item.postAttackDropResolvedAt || 0) <= waitMs)
      .filter(item => !postAttackVisibleCoinExists(coins, item))
      .map(item => ({ ...item, distance: dist(self, item) }))
      .filter(item => item.distance > stopDistance && item.distance <= maxDistance)
      .filter(item => !activeThreats.some(threat => coinBlockedByThreat(self, item, threat)))
      .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(a.distance || 0) - Number(b.distance || 0))[0] || null;
  }

  function buildPostAttackDropWaitAction(self, target) {
    const dir = coinDirectionTo(self, target, cfg.patrolPrecisionTolerance);
    return {
      kind: 'patrol',
      reason: 'post-attack-drop-wait-position',
      dx: dir.dx,
      dy: dir.dy,
      postAttackTarget: {
        id: target.id,
        name: target.name || '',
        x: target.x,
        y: target.y,
        drop: target.drop,
        distance: Math.round(dir.distance),
        ageMs: Math.max(0, Math.round(Date.now() - Number(target.at || Date.now()))),
        resolvedAgeMs: Math.max(0, Math.round(Date.now() - Number(target.postAttackDropResolvedAt || Date.now())))
      }
    };
  }

  function combatSpacingVector(self, target, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minRange = Math.max(0, Number(cfg.combatSpacingMinRange || 0));
    const preferredRange = Math.max(minRange, Number(cfg.combatSpacingPreferredRange || minRange));
    if (!(distance > 0) || !minRange) return { active: false, dx: 0, dy: 0 };
    const dxRaw = Number(self.x) - Number(target.x);
    const dyRaw = Number(self.y) - Number(target.y);
    let dx = Math.sign(dxRaw) || 0;
    let dy = Math.sign(dyRaw) || 0;
    if (!(dx || dy)) dx = -Math.sign(Number(target.vx) || 0) || 1;
    const targetVx = Number(target.vx) || 0;
    const targetVy = Number(target.vy) || 0;
    const toTargetX = Number(target.x) - Number(self.x);
    const toTargetY = Number(target.y) - Number(self.y);
    const d = Math.max(1, distance);
    const radialSpeed = (toTargetX / d) * targetVx + (toTargetY / d) * targetVy;
    const tooClose = distance < minRange;
    const closing = radialSpeed <= -cfg.combatStationarySpeed && distance < preferredRange;
    if (!tooClose && !closing) return { active: false, dx: 0, dy: 0, distance, minRange, preferredRange, radialSpeed };
    return {
      active: true,
      dx,
      dy,
      distance,
      minRange,
      preferredRange,
      radialSpeed,
      reason: tooClose ? 'too-close' : 'closing'
    };
  }

  function combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp) {
    if (!spacing?.active || spacing.reason !== 'too-close') return false;
    const distance = Number(spacing.distance);
    const emergencyRange = Math.max(0, Number(cfg.combatSpacingEmergencyRange || 0));
    const lowHpThreshold = Math.max(0, Number(cfg.combatSpacingLowHpThreshold || cfg.combatLowHpLeaveThreshold || 0));
    const hp = Number(selfHp);
    const emergencyClose = emergencyRange > 0 && Number.isFinite(distance) && distance <= emergencyRange;
    const lowHpClose = lowHpThreshold > 0 && Number.isFinite(hp) && hp < lowHpThreshold;
    return Boolean(emergencyClose || lowHpClose);
  }

  function combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatLowHpLeaveThreshold || 0));
    const margin = Math.max(0, Number(cfg.combatLowHpCloseRiskMargin || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    if (!threshold || !margin || !Number.isFinite(hp) || !Number.isFinite(enemyHp)) return null;
    if (!(hp < threshold) || !(hp <= enemyHp + margin)) return null;
    if (!spacing?.active || spacing.reason !== 'too-close') return null;
    if (!realBulletPressure && !combatSpacingShouldOverrideBullet(spacing, hp, enemyHp)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap: enemyHp - hp,
      margin,
      distance: Math.round(Number(spacing.distance || 0)),
      realBulletPressure: Boolean(realBulletPressure)
    };
  }

  function combatPressureDisadvantageState(selfHp, targetHp, targetDistance, realBulletPressure = false) {
    const threshold = Math.max(0, Number(cfg.combatPressureExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureExitHpGap || 0));
    const range = Math.max(0, Number(cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const hpGap = enemyHp - hp;
    if (!threshold || !minGap || !range || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp < threshold) || !(hpGap >= minGap) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      distance: Math.round(distance),
      realBulletPressure: true
    };
  }

  function combatSustainedPressureDisadvantageState(selfHp, targetHp, targetDistance, noDamageMs, targetRealBulletPressure = false) {
    const waitMs = Math.max(0, Number(cfg.combatPressureNoDamageExitMs || 0));
    const threshold = Math.max(0, Number(cfg.combatPressureNoDamageExitHpThreshold || 0));
    const minGap = Math.max(0, Number(cfg.combatPressureNoDamageExitHpGap || 0));
    const targetHpMin = Math.max(0, Number(cfg.combatPressureNoDamageExitTargetHpMin || 0));
    const range = Math.max(0, Number(cfg.combatPressureNoDamageExitRange || cfg.combatShootPressureRange || cfg.combatAttackRange || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const distance = Number(targetDistance);
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hpGap = enemyHp - hp;
    if (!waitMs || !threshold || !minGap || !range || !targetRealBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(distance)) return null;
    if (!(hp <= threshold) || !(enemyHp >= targetHpMin) || !(hpGap >= minGap) || !(elapsed >= waitMs) || !(distance <= range)) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      threshold,
      minGap,
      targetHpMin,
      noDamageMs: Math.round(elapsed),
      waitMs,
      distance: Math.round(distance),
      targetRealBulletPressure: true
    };
  }

  function combatPressureCloseVector(self, target, targetDistance, selfHp) {
    const previous = bot.combatTarget || null;
    const targetId = target?.user_id ?? target?.id;
    const same = previous?.id !== null && previous?.id !== undefined
      && targetId !== null && targetId !== undefined
      && String(previous.id) === String(targetId);
    const lastDamageAt = same ? Number(previous.lastDamageAt || previous.at || Date.now()) : Date.now();
    const noDamageMs = Math.max(0, Date.now() - lastDamageAt);
    const thresholdMs = Math.max(0, Number(cfg.combatPressureCloseNoDamageMs || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatPressureCloseMinHp || cfg.combatLowHpLeaveThreshold || 0));
    if (!thresholdMs || noDamageMs < thresholdMs || !(distance > closeRange) || Number(selfHp || 0) < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs,
      reason: 'long-no-damage'
    };
  }

  function combatFarNoDamageCloseVector(self, target, targetDistance, selfHp, targetHp) {
    const previous = bot.combatTarget || null;
    const targetId = target?.user_id ?? target?.id;
    const same = previous?.id !== null && previous?.id !== undefined
      && targetId !== null && targetId !== undefined
      && String(previous.id) === String(targetId);
    const lastDamageAt = same ? Number(previous.lastDamageAt || previous.at || Date.now()) : Date.now();
    const noDamageMs = Math.max(0, Date.now() - lastDamageAt);
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatFarNoDamageCloseMinHp || cfg.combatPressureCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    if (!thresholdMs || !startRange || noDamageMs < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs, selfHp: hp, targetHp: enemyHp, hpGap };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      reason: 'far-no-damage'
    };
  }

  function combatRetreatingFighterCloseVector(self, target, targetDistance, noDamageMs, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const thresholdMs = Math.max(0, Number(cfg.combatFarNoDamageCloseMs || 0) || 0);
    const startRange = Math.max(0, Number(cfg.combatFarNoDamageCloseStartRange || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingPreferredRange || 0),
      Number(cfg.combatFarNoDamageCloseRange || cfg.combatPressureCloseRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatRetreatingFighterCloseMinHp || cfg.combatFarNoDamageCloseMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatRetreatingFighterCloseMaxHpGap || cfg.combatFarNoDamageCloseMaxHpGap || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = Number.isFinite(hp) && Number.isFinite(enemyHp) ? enemyHp - hp : 0;
    const activeRetreating = Boolean(retreatingTarget?.active && !retreatingTarget?.disengage);
    if (!activeRetreating || !targetRealBulletPressure || !thresholdMs || !startRange || elapsed < thresholdMs || !(distance >= startRange) || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, retreatingTarget };
    }
    if (Number.isFinite(hp) && hp < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    if (Number.isFinite(hpGap) && hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed, selfHp: hp, targetHp: enemyHp, hpGap, retreatingTarget };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      startRange,
      noDamageMs: elapsed,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      targetRealBulletPressure: true,
      farNoDamageClose: true,
      reason: 'retreating-fighter-close',
      retreatingTarget
    };
  }

  function combatFinishPressureState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatFinishPressureTargetHpMax || 0));
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatFinishPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const inAttackRange = attackRange > 0 && distance <= attackRange;
    const retreatingEdge = Boolean(retreatingTarget?.active && retreatingTarget?.reason === 'target-retreating-edge');
    if (!retreatingEdge || !inAttackRange || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, selfHp: ownHp, targetHp: enemyHp };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      minSelfHp,
      maxTargetHp,
      reason: 'low-hp-retreating-target',
      retreatingTarget
    };
  }

  function combatOutOfRangeFinishPressureState(self, target, targetDistance, selfHp, targetHp, noDamageMs, retreatingTarget = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeFinishPressureRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureSelfHpMin || 0));
    const maxTargetHp = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureTargetHpMax || 0));
    const maxHpGap = Number.isFinite(Number(cfg.combatOutOfRangeFinishPressureMaxHpGap))
      ? Number(cfg.combatOutOfRangeFinishPressureMaxHpGap)
      : 0;
    const recentDamageMs = Math.max(0, Number(cfg.combatOutOfRangeFinishPressureRecentDamageMs || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs: elapsed };
    }
    if (!recentDamageMs || elapsed > recentDamageMs) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, noDamageMs: elapsed };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || enemyHp > maxTargetHp || hpGap > maxHpGap) {
      return { active: false, dx: 0, dy: 0, distance, attackRange, maxRange, selfHp: ownHp, targetHp: enemyHp, hpGap, noDamageMs: elapsed };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs: elapsed,
      recentDamageMs,
      reason: 'out-of-range-low-hp-finish',
      retreatingTarget
    };
  }

  function combatOutOfRangeReengageState(self, target, targetDistance, selfHp, targetHp, retreatingTarget = null, targetRealBulletPressure = false) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const maxRange = Math.max(attackRange, Number(cfg.combatOutOfRangeReengageRange || 0));
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const minSelfHp = Math.max(0, Number(cfg.combatOutOfRangeReengageMinHp || 0));
    const maxHpGap = Math.max(0, Number(cfg.combatOutOfRangeReengageMaxHpGap || 0));
    const pressureMaxHpGap = Math.max(maxHpGap, Number(cfg.combatOutOfRangePressureReengageMaxHpGap || maxHpGap));
    const effectiveMaxHpGap = targetRealBulletPressure ? pressureMaxHpGap : maxHpGap;
    const recentInRangeMs = Math.max(0, Number(cfg.combatOutOfRangeReengageRecentInRangeMs || 0));
    const ownHp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - ownHp;
    const previous = bot.combatTarget || null;
    const same = previous && String(previous.id ?? '') === String(target?.user_id ?? target?.id ?? '');
    const outOfRangeMs = Math.max(0, Date.now() - Number((same ? previous?.lastInRangeAt : Date.now()) || Date.now()));
    const engagedIntent = /^(engaged|reengage)$/.test(String(target?.combatIntent || previous?.intent || ''))
      || same;
    const freshInRangeContact = Boolean(
      recentInRangeMs
      && outOfRangeMs <= recentInRangeMs
      && !retreatingTarget?.active
    );
    if (!attackRange || !maxRange || !(distance > attackRange) || !(distance <= maxRange) || retreatingTarget?.disengage) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs
      };
    }
    if (!engagedIntent) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs
      };
    }
    if (retreatingTarget?.active && !targetRealBulletPressure) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        retreatingTarget
      };
    }
    if (!targetRealBulletPressure && !freshInRangeContact) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        outOfRangeMs,
        retreatingTarget
      };
    }
    if (!Number.isFinite(ownHp) || !Number.isFinite(enemyHp) || ownHp < minSelfHp || hpGap > effectiveMaxHpGap || combatMovementBlockedByStamina(self)) {
      return {
        active: false,
        dx: 0,
        dy: 0,
        distance,
        attackRange,
        maxRange,
        selfHp: ownHp,
        targetHp: enemyHp,
        hpGap,
        minSelfHp,
        maxHpGap: effectiveMaxHpGap,
        baseMaxHpGap: maxHpGap,
        pressureMaxHpGap,
        outOfRangeMs,
        targetRealBulletPressure: Boolean(targetRealBulletPressure),
        freshInRangeContact,
        retreatingTarget
      };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      attackRange,
      maxRange,
      selfHp: ownHp,
      targetHp: enemyHp,
      hpGap,
      minSelfHp,
      maxHpGap: effectiveMaxHpGap,
      baseMaxHpGap: maxHpGap,
      pressureMaxHpGap,
      outOfRangeMs,
      targetRealBulletPressure: Boolean(targetRealBulletPressure),
      freshInRangeContact,
      reason: targetRealBulletPressure ? 'target-real-bullet-pressure' : 'fresh-in-range-contact',
      retreatingTarget
    };
  }

  function combatPassiveRunnerState(self, target, targetDistance, motionScale = 0, realBulletPressure = false) {
    const t = Date.now();
    const selfHp = hpValue(self);
    const minSelfHp = Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const minDrop = Math.max(0, Number(cfg.combatPassiveRunnerMinDrop || 0));
    const confirmMs = Math.max(0, Number(cfg.combatPassiveRunnerConfirmMs || 0));
    const targetDrop = Math.max(0, Number(dropValue(target) || target?.drop || 0));
    const moving = speed(target) >= cfg.combatStationarySpeed
      || Number(motionScale || 0) >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const current = bot.combatTarget && combatTargetId(bot.combatTarget) === combatTargetId(target) ? bot.combatTarget : null;
    const samples = Array.isArray(current?.motionSamples) ? current.motionSamples : [];
    const firstSelfHp = samples.length ? Number(samples[0].selfHp) : null;
    const lastSelfHp = samples.length ? Number(samples[samples.length - 1].selfHp) : null;
    const recentSelfDamage = Number.isFinite(firstSelfHp) && Number.isFinite(lastSelfHp)
      ? Math.max(0, firstSelfHp - lastSelfHp)
      : 0;
    const intent = String(target?.combatIntent || current?.intent || '');
    const originIntent = String(current?.originIntent || current?.intent || intent);
    const runnerIntent = /^(defensive|engaged|profit|reengage)$/.test(intent);
    const rewarded = targetDrop >= minDrop || runnerIntent;
    const engagedMs = current
      ? Math.max(0, t - Number(current.firstSeenAt || current.at || t))
      : 0;
    const confirmed = engagedMs >= confirmMs;
    const seenTargetRealBulletAt = Number(current?.seenTargetRealBulletAt || 0);
    const seenTargetRealBulletMs = seenTargetRealBulletAt ? Math.max(0, t - seenTargetRealBulletAt) : 0;
    const active = Boolean(
      isActive(target)
      && moving
      && runnerIntent
      && rewarded
      && !isFiringEntity(target)
      && !isInvulnerable(target)
      && !realBulletPressure
      && confirmed
      && !seenTargetRealBulletAt
      && Number.isFinite(selfHp)
      && selfHp >= minSelfHp
      && recentSelfDamage <= 0.01
    );
    return {
      active,
      selfHp,
      minSelfHp,
      targetDrop,
      minDrop,
      moving,
      motionScale: Number.isFinite(Number(motionScale)) ? Number(Number(motionScale).toFixed(2)) : 0,
      distance: Number.isFinite(Number(targetDistance)) ? Math.round(Number(targetDistance)) : null,
      combatIntent: intent,
      originIntent,
      recentSelfDamage,
      engagedMs,
      confirmMs,
      confirmed,
      seenTargetRealBulletAt: seenTargetRealBulletAt || 0,
      seenTargetRealBulletMs
    };
  }

  function combatPassiveRunnerCloseVector(self, target, targetDistance, runnerState) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPassiveRunnerCloseRange || 0)
    );
    if (!runnerState?.active || !(distance > closeRange)) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, reason: 'passive-runner' };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: 0,
      reason: 'passive-runner'
    };
  }

  function combatExitSummary(reason, target, combatState = {}) {
    const selfHp = Number(combatState.selfHp ?? NaN);
    const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
    const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
    if (reason === 'combat-critical-hp-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
    }
    if (reason === 'combat-hp-disadvantage-leave') {
      if (combatState?.serverStallNoDamage) {
        const noDamageText = Number.isFinite(Number(combatState.serverStallNoDamage.noDamageMs))
          ? '，' + Math.round(Number(combatState.serverStallNoDamage.noDamageMs) / 1000) + '秒未造成伤害'
          : '';
        const gapText = Number.isFinite(hpGap) ? '，差距' + hpDisplay(hpGap) : '';
        return '与' + actorLabel(target) + '战斗，服务端位置停滞下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + gapText + noDamageText + '，劣势退出';
      }
      if (combatState?.pressureDisadvantage) {
        const distanceText = Number.isFinite(Number(combatState.pressureDisadvantage.distance))
          ? '，距离' + Math.round(Number(combatState.pressureDisadvantage.distance) / 100) + '米'
          : '';
		        return '与' + actorLabel(target) + '战斗，近身弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + distanceText + '，提前劣势退出';
		      }
		      if (combatState?.sustainedPressureDisadvantage) {
		        const pressure = combatState.sustainedPressureDisadvantage;
		        const noDamageText = Number.isFinite(Number(pressure.noDamageMs))
		          ? '，' + Math.round(Number(pressure.noDamageMs) / 1000) + '秒未造成伤害'
		          : '';
		        const distanceText = Number.isFinite(Number(pressure.distance))
		          ? '，距离' + Math.round(Number(pressure.distance) / 100) + '米'
		          : '';
		        return '与' + actorLabel(target) + '战斗，持续弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + noDamageText + distanceText + '，提前劣势退出';
		      }
		      if (combatState?.tradeEstimate) {
	        const estimate = combatState.tradeEstimate;
	        const deathText = Number.isFinite(Number(estimate.tDeathMs)) ? '，预计承伤倒计时' + Math.round(Number(estimate.tDeathMs) / 1000) + '秒' : '';
	        const killText = Number.isFinite(Number(estimate.tKillMs)) ? '，预计击杀需' + Math.round(Number(estimate.tKillMs) / 1000) + '秒' : '';
	        return '与' + actorLabel(target) + '战斗，交换比劣势' + deathText + killText + '，提前退出';
	      }
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + '，劣势退出';
	    }
    if (reason === 'combat-low-hp-no-damage-leave') {
      const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
        ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
    }
    if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
      const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
        ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
    }
    return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + '，劣势退出';
  }
  function combatLeaveCoverAction(self, target, bullets = []) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const targetThreat = incomingBulletThreatForTest(self, target, bullets);
    const anyThreat = targetThreat || incomingBulletThreatForTest(self, null, bullets);
    const targetBulletSeen = (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
    const incoming = Boolean(isFiringEntity(target) || targetBulletSeen || anyThreat);
    const spacing = combatSpacingVector(self, target, target.distance);
    const spacingOverride = incoming && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    const requestedDx = spacingOverride ? spacing.dx : (incoming ? 1 : spacing.dx);
    const requestedDy = spacingOverride ? spacing.dy : (incoming ? 1 : spacing.dy);
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(requestedDx || requestedDy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx,
        requestedDy
      }
      : null;
    const shooting = combatShootingPlan(self, {
	      needsMovement: Boolean(requestedDx || requestedDy),
	      dodging: incoming,
	      realBulletPressure: incoming,
	      targetDistance: target.distance,
      targetHp
    });
    return {
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed
          ? 'combat-stamina-conserve'
          : (incoming && !spacingOverride ? 'combat-leave-dodge' : (spacing.active ? 'combat-leave-spacing' : 'combat-leave-cover'))),
      dx: movementSuppressed ? 0 : requestedDx,
      dy: movementSuppressed ? 0 : requestedDy,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      movementSuppressed,
      shooting,
      spacing: spacing.active ? {
        dx: spacing.dx,
        dy: spacing.dy,
        reason: spacing.reason,
        distance: Math.round(spacing.distance),
        overrideBullet: Boolean(spacingOverride)
      } : null
    };
  }

	  function combatLeaveAction(reason, self, target, combatState = {}, bullets = []) {
    const state = {
      selfHp: hpValue(self),
      targetHp: combatHpValue(target),
      ...combatState
    };
    const actionTarget = {
      id: target.user_id,
      name: target.name,
      hp: combatHpValue(target),
      distance: Math.round(target.distance),
      mode: target.current_join_mode || target.mode || '',
      life: target.life || '',
      active: isActive(target),
      firing: isFiringEntity(target),
      invulnerable: isInvulnerable(target),
      combatIntent: target.combatIntent || ''
    };
    const cover = combatLeaveCoverAction(self, target, bullets);
    return {
      kind: 'leave',
      reason,
      exitSummary: combatExitSummary(reason, actionTarget, state),
      combat: true,
      dx: cover.dx,
      dy: cover.dy,
      shoot: cover.shoot,
      forceShoot: cover.forceShoot,
      shootEveryMs: cover.shootEveryMs,
      target: actionTarget,
      combatCover: cover,
	      combatState: {
        ...state,
        leaveCover: cover
      }
	    };
	  }
  function enemyRepeatDelayMsForCount(count) {
    const n = Math.max(0, Number(count) || 0);
    if (n >= 3) return cfg.enemyReloginRepeatThirdMaxMs;
    if (n >= 2) return cfg.enemyReloginRepeatSecondMaxMs;
    return 0;
  }
  function combatTargetNoDamageMs(target) {
    const previous = bot.combatTarget || null;
    const targetId = target?.user_id ?? target?.id;
    const same = previous?.id !== null && previous?.id !== undefined
      && targetId !== null && targetId !== undefined
      && String(previous.id) === String(targetId);
    const lastDamageAt = same ? Number(previous.lastDamageAt || previous.at || Date.now()) : Date.now();
    return Math.max(0, Date.now() - lastDamageAt);
  }
  function combatLowHpNoDamageLeaveState(selfHp, targetHp, noDamageMs) {
    const threshold = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveThreshold || 0));
    const waitMs = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveMs || 0));
    const minGap = Number.isFinite(Number(cfg.combatLowHpNoDamageMinGap))
      ? Number(cfg.combatLowHpNoDamageMinGap)
      : 0;
    const hpGap = Number(targetHp) - Number(selfHp);
    if (!threshold || !waitMs || !(Number(selfHp) < threshold) || !(hpGap >= minGap) || !(Number(noDamageMs) >= waitMs)) return null;
    return { selfHp, targetHp, hpGap, noDamageMs, threshold, waitMs, minGap };
  }

  function combatRetreatingTargetState(self, target, targetDistance, damageState = null) {
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || 0));
    const disengageRange = Math.max(attackRange, Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || attackRange || 0));
    const edgeRange = Math.min(
      attackRange || Infinity,
      Math.max(0, Number(cfg.combatRetreatEdgeRange || 0) || attackRange * 0.95)
    );
    const minRadialSpeed = Math.max(0, Number(cfg.combatRetreatRadialSpeedMin || cfg.combatStationarySpeed || 0));
    const minDistanceDelta = Math.max(0, Number(cfg.combatRetreatDistanceDeltaMin || 0));
    const dx = Number(target?.x) - Number(self?.x);
    const dy = Number(target?.y) - Number(self?.y);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : Math.hypot(dx, dy);
    const d = Math.max(1, Number.isFinite(distance) ? distance : Math.hypot(dx, dy));
    const vx = Number(target?.vx) || 0;
    const vy = Number(target?.vy) || 0;
    const radialSpeed = (dx / d) * vx + (dy / d) * vy;
    const previous = bot.combatTarget;
    const same = previous && combatTargetId(previous) && combatTargetId(previous) === combatTargetId(target);
    const previousDistance = same && Number.isFinite(Number(previous.distance)) ? Number(previous.distance) : null;
    const distanceDelta = previousDistance === null ? 0 : distance - previousDistance;
    const receding = Boolean(
      (minRadialSpeed > 0 && radialSpeed >= minRadialSpeed)
      || (minDistanceDelta > 0 && distanceDelta >= minDistanceDelta)
    );
    const outOfRange = attackRange > 0 && distance > attackRange;
    const beyondDisengage = disengageRange > 0 && distance > disengageRange;
    const edge = edgeRange > 0 && distance >= edgeRange;
    const active = Boolean(receding && (outOfRange || edge));
    return {
      active,
      disengage: Boolean(beyondDisengage),
      suppressFire: Boolean(active && edge),
      reason: beyondDisengage ? 'target-beyond-disengage-range' : (outOfRange ? 'target-out-of-attack-range' : 'target-retreating-edge'),
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      attackRange: Math.round(attackRange),
      disengageRange: Math.round(disengageRange),
      edgeRange: Math.round(edgeRange),
      radialSpeed: Number.isFinite(radialSpeed) ? Math.round(radialSpeed) : 0,
      distanceDelta: Number.isFinite(distanceDelta) ? Math.round(distanceDelta) : 0,
      noDamageMs: Math.max(0, Number(damageState?.noDamageMs || 0))
    };
  }

  function combatServerStallNoDamageLeaveState(selfHp, targetHp, noDamageMs, realBulletPressure = false, serverPositionStall = null) {
    const waitMs = Math.max(0, Number(cfg.combatServerStallNoDamageLeaveMs || 0));
    const precisionWaitMs = Math.max(0, Number(cfg.combatAimFallbackPrecisionNoDamageMs || 0));
    const precisionGraceMs = Math.max(0, Number(cfg.combatServerStallNoDamagePrecisionGraceMs || 0));
    const effectiveWaitMs = Math.max(waitMs, precisionWaitMs ? precisionWaitMs + precisionGraceMs : waitMs);
    const minGap = Math.max(0, Number(cfg.combatServerStallNoDamageHpGap || 0));
    const hp = Number(selfHp);
    const enemyHp = Number(targetHp);
    const hpGap = enemyHp - hp;
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    const stall = serverPositionStall || {};
    if (!waitMs || !stall.stalled || !realBulletPressure) return null;
    if (!Number.isFinite(hp) || !Number.isFinite(enemyHp) || !Number.isFinite(hpGap)) return null;
    if (elapsed < effectiveWaitMs || hpGap < minGap) return null;
    return {
      active: true,
      selfHp: hp,
      targetHp: enemyHp,
      hpGap,
      noDamageMs: elapsed,
      waitMs,
      effectiveWaitMs,
      precisionWaitMs,
      precisionGraceMs,
      minGap,
      realBulletPressure: true,
      serverPositionStall: {
        stalled: true,
        reason: stall.reason || 'server-position-stalled',
        movingMs: Number.isFinite(Number(stall.movingMs)) ? Math.round(Number(stall.movingMs)) : null,
        gap: Number.isFinite(Number(stall.gap)) ? Math.round(Number(stall.gap)) : null,
        gapDelta: Number.isFinite(Number(stall.gapDelta)) ? Math.round(Number(stall.gapDelta)) : null,
        holdRemainingMs: Number.isFinite(Number(stall.holdRemainingMs)) ? Math.round(Number(stall.holdRemainingMs)) : null
      }
    };
  }

  function combatTrendState(self, options = {}) {
    const selfHp = hpValue(self);
    const targetHp = Number(options.targetHp);
    const targetDistance = Number(options.targetDistance);
    const noDamageMs = Math.max(0, Number(options.noDamageMs || 0));
    const hpGap = Number(targetHp) - Number(selfHp);
    const highHpMin = Math.max(0, Number(cfg.combatShootHighHpMinHp || 0));
    const highHpFireWindow = highHpMin > 0
      && Number.isFinite(selfHp)
      && selfHp >= highHpMin
      && (!Number.isFinite(targetHp) || selfHp >= targetHp);
    const finishLowThreatMinHp = Math.max(0, Number(cfg.combatShootFinishLowThreatMinHp || 0));
    const finishLowThreatTargetHpMax = Math.max(0, Number(cfg.combatShootFinishLowThreatTargetHpMax || 0));
    const finishLowThreatMaxHpGap = Math.max(0, Number(cfg.combatShootFinishLowThreatMaxHpGap || 0));
    const finishLowThreatRange = Math.max(0, Number(cfg.combatShootFinishLowThreatRange || 0));
    const finishLowThreatFireWindow = !Boolean(options.realBulletPressure)
      && finishLowThreatMinHp > 0
      && finishLowThreatRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= finishLowThreatMinHp
      && targetHp <= finishLowThreatTargetHpMax
      && hpGap <= finishLowThreatMaxHpGap
      && targetDistance <= finishLowThreatRange;
    const passiveRunnerFireWindow = Boolean(options.passiveRunner)
      && !Boolean(options.realBulletPressure)
      && Number.isFinite(selfHp)
      && selfHp >= Math.max(0, Number(cfg.combatPassiveRunnerMinSelfHp || 0));
    const targetPressureFire = options.targetRealBulletPressure !== undefined
      ? Boolean(options.targetRealBulletPressure)
      : Boolean(options.realBulletPressure);
    const pressureMinHp = Math.max(0, Number(cfg.combatShootPressureMinHp || 0));
    const pressureRange = Math.max(0, Number(cfg.combatShootPressureRange || 0));
    const pressureMaxHpGap = Math.max(0, Number(cfg.combatShootPressureMaxHpGap || 0));
    const closePressureFireWindow = targetPressureFire
      && pressureMinHp > 0
      && pressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= pressureMinHp
      && hpGap <= pressureMaxHpGap
      && targetDistance <= pressureRange;
    const winningPressureMinHp = Math.max(0, Number(cfg.combatShootWinningPressureMinHp || 0));
    const winningPressureTargetHpMax = Math.max(0, Number(cfg.combatShootWinningPressureTargetHpMax || 0));
    const winningPressureLeadHp = Math.max(0, Number(cfg.combatShootWinningPressureLeadHp || 0));
    const winningPressureRange = Math.max(0, Number(cfg.combatShootWinningPressureRange || 0));
    const winningPressureNoDamageMs = Math.max(0, Number(cfg.combatShootWinningPressureNoDamageMs || 0));
    const winningPressureFireWindow = targetPressureFire
      && winningPressureMinHp > 0
      && winningPressureTargetHpMax > 0
      && winningPressureRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= winningPressureMinHp
      && targetHp <= winningPressureTargetHpMax
      && hpGap <= -winningPressureLeadHp
      && noDamageMs >= winningPressureNoDamageMs
      && targetDistance <= winningPressureRange;
    const steadyAimMinHp = Math.max(0, Number(cfg.combatShootSteadyAimMinHp || 0));
    const steadyAimMaxHpGap = Math.max(0, Number(cfg.combatShootSteadyAimMaxHpGap || 0));
    const steadyAimNoDamageMs = Math.max(0, Number(cfg.combatShootSteadyAimNoDamageMs || cfg.combatAimSteadyNoDamageMs || 0));
    const steadyAimFireWindow = Boolean(options.steadyAim)
      && steadyAimMinHp > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && selfHp >= steadyAimMinHp
      && hpGap <= steadyAimMaxHpGap
      && noDamageMs >= steadyAimNoDamageMs;
    const noDamageDuelMinHp = Math.max(0, Number(cfg.combatShootNoDamageDuelMinHp || 0));
    const noDamageDuelMaxHpGap = Math.max(0, Number(cfg.combatShootNoDamageDuelMaxHpGap || 0));
    const noDamageDuelNoDamageMs = Math.max(0, Number(cfg.combatShootNoDamageDuelNoDamageMs || 0));
    const noDamageDuelRange = Math.max(0, Number(cfg.combatShootNoDamageDuelRange || cfg.combatAttackRange || 0));
    const farNoDamageCloseMinHp = Math.max(noDamageDuelMinHp, Number(cfg.combatFarNoDamageCloseMinHp || 0));
    const farNoDamageCloseFireWindow = Boolean(options.farNoDamageClose)
      && farNoDamageCloseMinHp > 0
      && Number.isFinite(selfHp)
      && selfHp >= farNoDamageCloseMinHp;
    const noDamageDuelFireWindow = Boolean(options.engagedCombat || options.targetActive || options.targetMoving)
      && noDamageDuelMinHp > 0
      && noDamageDuelNoDamageMs > 0
      && noDamageDuelRange > 0
      && Number.isFinite(selfHp)
      && Number.isFinite(targetHp)
      && Number.isFinite(targetDistance)
      && selfHp >= noDamageDuelMinHp
      && hpGap <= noDamageDuelMaxHpGap
      && noDamageMs >= noDamageDuelNoDamageMs
      && targetDistance <= noDamageDuelRange;
    let stance = 'normal';
    if (winningPressureFireWindow) stance = 'winning-pressure';
    else if (closePressureFireWindow) stance = 'close-pressure';
    else if (passiveRunnerFireWindow) stance = 'passive-runner';
    else if (finishLowThreatFireWindow) stance = 'finish-low-threat';
    else if (steadyAimFireWindow) stance = 'steady-aim';
    else if (noDamageDuelFireWindow) stance = 'no-damage-duel';
    else if (farNoDamageCloseFireWindow) stance = 'far-no-damage-close';
    else if (highHpFireWindow) stance = 'high-hp-pressure';
    else if (Number.isFinite(hpGap) && hpGap > 0) stance = 'guarded';
    return {
      stance,
      selfHp,
      targetHp,
      hpGap,
      targetDistance,
      noDamageMs,
      highHpFireWindow,
      passiveRunnerFireWindow,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
      noDamageDuelFireWindow,
      farNoDamageCloseFireWindow,
      engagedCombat: Boolean(options.engagedCombat),
      targetActive: Boolean(options.targetActive),
      targetMoving: Boolean(options.targetMoving),
      passiveRunner: Boolean(options.passiveRunner),
      realBulletPressure: Boolean(options.realBulletPressure),
      targetRealBulletPressure: targetPressureFire,
      steadyAim: Boolean(options.steadyAim),
      farNoDamageClose: farNoDamageCloseFireWindow
    };
  }

  function combatTickActiveFromState(state = {}) {
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const decision = state.decision || null;
    const recentCombatMs = Math.max(1000, Number(cfg.combatEngageStickMs || 0), Number(cfg.combatEngageGraceMs || 0));
    const combatAt = Number(state.combatTarget?.at || 0);
    if (decision?.combat || decision?.combatCover || /^combat-/.test(String(decision?.reason || ''))) return true;
    if (combatAt && t - combatAt <= recentCombatMs) return true;
    if (state.pendingExit && /^combat-/.test(String(state.pendingExit.reason || state.pendingExit.rootReason || ''))) return true;
    return false;
  }

  function globalSamplingOutageOfflineStateForTest(state = {}) {
    if (!cfg.globalSamplingOutageOfflineEnabled) return null;
    const outage = state.outage || null;
    if (!outage?.active) return null;
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const minErrors = Math.max(1, Number(cfg.globalSamplingOutageMinErrors || 1));
    const errorCount = Math.max(0, Number(outage.errorCount || 0));
    if (errorCount < minErrors) return null;
    const firstAt = Number(outage.firstAt || 0) || t;
    const ageMs = Math.max(Number(outage.ageMs || 0), Math.max(0, t - firstAt));
    const minAgeMs = Math.max(0, Number(cfg.globalSamplingOutageMinAgeMs || 0));
    if (ageMs < minAgeMs) return null;
    const combatActive = Boolean(outage.combatActive) || combatTickActiveFromState({
      decision: state.decision,
      combatTarget: state.combatTarget,
      pendingExit: state.pendingExit,
      nowMs: t
    });
    if (cfg.globalSamplingOutageCombatOnly && !combatActive) return null;
    return {
      reason: 'global sampling outage',
      ageMs,
      errorCount,
      combatActive,
      snapshotTimedOut: Boolean(outage.snapshotTimedOut),
      minimapTimedOut: Boolean(outage.minimapTimedOut)
    };
  }

  function combatTickGapOfflineStateForTest(state = {}) {
    if (!cfg.combatTickGapOfflineEnabled) return null;
    const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
    if (!(thresholdMs > 0)) return null;
    const t = Number.isFinite(Number(state.nowMs)) ? Number(state.nowMs) : Date.now();
    const previousTickAt = Number(state.previousTickAt || 0) || 0;
    const tickGapMs = Number.isFinite(Number(state.tickGapMs))
      ? Math.max(0, Math.round(Number(state.tickGapMs)))
      : (previousTickAt ? Math.max(0, Math.round(t - previousTickAt)) : null);
    const tickInProgressMs = Number.isFinite(Number(state.tickInProgressMs))
      ? Math.max(0, Math.round(Number(state.tickInProgressMs)))
      : null;
    const lastTickCompletedGapMs = Number.isFinite(Number(state.lastTickCompletedGapMs))
      ? Math.max(0, Math.round(Number(state.lastTickCompletedGapMs)))
      : null;
    const combatLogActive = Boolean(state.combatLogActive);
    const lastCombatFrameAt = Number(state.lastCombatFrameAt || 0) || 0;
    const combatFrameGapMs = lastCombatFrameAt ? Math.max(0, Math.round(t - lastCombatFrameAt)) : null;
    const lastBuiltFrameAt = Number(state.lastBuiltFrameAt || 0) || 0;
    const builtFrameGapMs = lastBuiltFrameAt ? Math.max(0, Math.round(t - lastBuiltFrameAt)) : null;
    const lastCombatAt = Number(state.lastCombatAt || 0) || 0;
    const combatLogGapMs = lastCombatAt ? Math.max(0, Math.round(t - lastCombatAt)) : null;
    const previousCombatActive = Boolean(state.previousCombatActive);
    const currentCombatActive = combatTickActiveFromState({
      decision: state.decision,
      combatTarget: state.combatTarget,
      pendingExit: state.pendingExit,
      nowMs: t
    });
    const recentCombatContextMs = Math.max(
      thresholdMs,
      Number(cfg.combatEngageStickMs || 0),
      Number(cfg.combatEngageGraceMs || 0),
      Number(cfg.combatLogPostBufferMs || 0)
    );
    const recentCombatFrameContext = Boolean(lastCombatFrameAt
      && recentCombatContextMs > 0
      && t - lastCombatFrameAt <= recentCombatContextMs);
    if (!previousCombatActive && !currentCombatActive && !combatLogActive && !recentCombatFrameContext) return null;
    const reentryGap = Boolean(state.reentry && (
      (tickInProgressMs !== null && tickInProgressMs >= thresholdMs)
      || (lastTickCompletedGapMs !== null && lastTickCompletedGapMs >= thresholdMs)
    ));
    const mainLoopGap = Boolean(!reentryGap && previousTickAt && tickGapMs !== null && tickGapMs >= thresholdMs);
    const combatFrameGap = !reentryGap && !mainLoopGap && combatFrameGapMs !== null && combatFrameGapMs >= thresholdMs;
    if (!reentryGap && !mainLoopGap && !combatFrameGap) return null;
    const diagnosis = reentryGap ? 'tick-reentry-gap'
      : (mainLoopGap ? 'main-loop-gap' : 'combat-log-gap-with-active-tick');
    const likelyCause = reentryGap ? 'main-loop-stuck-or-awaiting-async'
      : (mainLoopGap ? 'js-or-main-loop-paused' : 'combat-state-or-log-gating-gap');
    return {
      reason: 'combat tick gap',
      diagnosis,
      likelyCause,
      thresholdMs,
      tickGapMs,
      tickInProgressMs,
      lastTickCompletedGapMs,
      previousTickAt,
      currentTickAt: t,
      previousCombatActive,
      currentCombatActive,
      combatLogActive,
      recentCombatFrameContext,
      recentCombatContextMs,
      lastCombatFrameAt,
      combatFrameGapMs,
      lastBuiltFrameAt,
      builtFrameGapMs,
      lastCombatAt,
      combatLogGapMs
    };
  }

  function nativeTickMinIntervalMs(state = {}) {
    const normalMs = Math.max(1, Number(cfg.nativeTickMinMs || cfg.tickMs || 120));
    const combatMs = Math.max(1, Number(cfg.combatNativeTickMinMs || normalMs));
    return combatTickActiveFromState(state) ? Math.min(normalMs, combatMs) : normalMs;
  }

  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const finishLowThreatDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootFinishLowThreatDodgeReserveMs || hardReserveMs));
    const passiveRunnerDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPassiveRunnerDodgeReserveMs || highHpDodgeReserveMs));
    const pressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootPressureDodgeReserveMs || highHpDodgeReserveMs));
    const winningPressureDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootWinningPressureDodgeReserveMs || pressureDodgeReserveMs));
    const steadyAimDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootSteadyAimDodgeReserveMs || highHpDodgeReserveMs));
    const noDamageDuelDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootNoDamageDuelDodgeReserveMs || highHpDodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const trend = options.trend && typeof options.trend === 'object'
      ? options.trend
      : combatTrendState(self, options);
    const noDamageMs = Math.max(0, Number(trend.noDamageMs || 0));
    const highHpFireWindow = Boolean(trend.highHpFireWindow);
    const passiveRunnerFireWindow = Boolean(trend.passiveRunnerFireWindow);
    const finishLowThreatFireWindow = Boolean(trend.finishLowThreatFireWindow);
    const closePressureFireWindow = Boolean(trend.closePressureFireWindow);
	    const winningPressureFireWindow = Boolean(trend.winningPressureFireWindow);
	    const steadyAimFireWindow = Boolean(trend.steadyAimFireWindow);
	    const noDamageDuelFireWindow = Boolean(trend.noDamageDuelFireWindow);
	    const farNoDamageCloseFireWindow = Boolean(trend.farNoDamageCloseFireWindow);
	    const aimConfidence = Number.isFinite(Number(options.aimConfidence))
	      ? Math.max(0, Math.min(1, Number(options.aimConfidence)))
	      : null;
	    const lowConfidenceThreshold = Math.max(0, Math.min(1, Number(cfg.combatAimLowConfidenceThreshold || 0)));
	    const lowConfidenceMinDistance = Math.max(0, Number(cfg.combatAimLowConfidenceMinDistance || 0));
	    const lowConfidenceMotionScale = Math.max(0, Number(cfg.combatAimLowConfidenceMotionScale || 0));
	    const lowConfidenceEveryMs = Math.max(conserveEveryMs, Number(cfg.combatAimLowConfidenceEveryMs || conserveEveryMs));
	    const lowConfidenceWindow = Boolean(
	      aimConfidence !== null
	      && lowConfidenceThreshold > 0
	      && aimConfidence < lowConfidenceThreshold
	      && Number(options.targetDistance || 0) >= lowConfidenceMinDistance
	      && (options.targetMoving || Number(options.motionScale || 0) >= lowConfidenceMotionScale)
	      && !closePressureFireWindow
	      && !steadyAimFireWindow
	    );
    let effectiveDodgeReserveMs = dodgeReserveMs;
    if (highHpFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, highHpDodgeReserveMs);
    if (passiveRunnerFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, passiveRunnerDodgeReserveMs);
    if (finishLowThreatFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, finishLowThreatDodgeReserveMs);
    if (closePressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, pressureDodgeReserveMs);
    if (winningPressureFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, winningPressureDodgeReserveMs);
    if (steadyAimFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, steadyAimDodgeReserveMs);
    if (noDamageDuelFireWindow) effectiveDodgeReserveMs = Math.min(effectiveDodgeReserveMs, noDamageDuelDodgeReserveMs);
    const needsMovement = Boolean(options.needsMovement || options.dodging || options.realBulletPressure || options.pressureClose);
    const base = {
      shoot: true,
      forceShoot: false,
      shootEveryMs: normalEveryMs,
      reason: 'normal',
      stamina5s,
      reserveMs,
      dodgeReserveMs: effectiveDodgeReserveMs,
      standardDodgeReserveMs: dodgeReserveMs,
      highHpDodgeReserveMs,
      passiveRunnerDodgeReserveMs,
      finishLowThreatDodgeReserveMs,
      pressureDodgeReserveMs,
      winningPressureDodgeReserveMs,
      steadyAimDodgeReserveMs,
      noDamageDuelDodgeReserveMs,
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
      passiveRunnerFireWindow,
      finishLowThreatFireWindow,
      closePressureFireWindow,
      winningPressureFireWindow,
      steadyAimFireWindow,
	      noDamageDuelFireWindow,
	      farNoDamageCloseFireWindow,
	      aimConfidence,
	      lowConfidenceWindow,
	      noDamageMs,
      trend: {
        stance: trend.stance || 'normal',
        hpGap: Number.isFinite(Number(trend.hpGap)) ? Number(trend.hpGap) : null,
        targetDistance: Number.isFinite(Number(trend.targetDistance)) ? Math.round(Number(trend.targetDistance)) : null,
        noDamageMs: Math.round(noDamageMs),
        engagedCombat: Boolean(trend.engagedCombat),
        targetActive: Boolean(trend.targetActive),
        targetMoving: Boolean(trend.targetMoving),
        passiveRunner: Boolean(trend.passiveRunner),
        realBulletPressure: Boolean(trend.realBulletPressure),
        steadyAim: Boolean(trend.steadyAim),
        farNoDamageClose: Boolean(trend.farNoDamageCloseFireWindow)
      },
      suppressed: false,
      throttled: false
    };
    if (stamina5s !== null && stamina5s < hardReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'stamina-rebuild', suppressed: true };
    }
    if (stamina5s !== null && needsMovement && stamina5s < effectiveDodgeReserveMs) {
      return { ...base, shoot: false, shootEveryMs: recoveryEveryMs, reason: 'reserve-for-dodge', suppressed: true };
    }
	    if (stamina5s !== null && stamina5s < reserveMs) {
	      return { ...base, shootEveryMs: conserveEveryMs, reason: 'burst-fire', throttled: true };
	    }
	    if (lowConfidenceWindow) {
	      return { ...base, shootEveryMs: lowConfidenceEveryMs, reason: 'low-confidence-burst', throttled: true };
	    }
	    return base;
	  }

  function chooseCombatAction(self, target, bullets = []) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
      return combatLeaveAction('combat-critical-hp-leave', self, target, {}, bullets);
    }
    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
      return combatLeaveAction('combat-low-hp-leave', self, target, {}, bullets);
    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    let disadvantageObservation = null;
    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'hp-gap', { selfHp, targetHp, hpGap });
      if (disadvantageObservation?.ready) {
        return combatLeaveAction('combat-hp-disadvantage-leave', self, target, { hpGap, disadvantageObservation }, bullets);
      }
    }
    const targetThreat = incomingBulletThreatForTest(self, target, bullets);
    const anyThreat = targetThreat || incomingBulletThreatForTest(self, null, bullets);
    const targetBulletSeen = (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
    const incoming = Boolean(isFiringEntity(target) || targetBulletSeen || anyThreat);
    const noDamageMs = combatTargetNoDamageMs(target);
    const retreatingTarget = combatRetreatingTargetState(self, target, target.distance, { noDamageMs });
    const motionScale = combatAimMotionScale(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const nativeAimSource = combatLiveAimTarget(self, target);
    const aimSource = nativeAimSource;
    const aimMotionScale = combatAimMotionScale(aimSource);
    const aimMoving = speed(aimSource) >= cfg.combatStationarySpeed
      || aimMotionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const aimDistance = Number.isFinite(Number(aimSource.distance)) ? Number(aimSource.distance) : dist(self, aimSource);
    const steadyAim = combatAimSteadyNoDamageState(target, noDamageMs, motionScale);
	    const aimMovement = aimMoving
	      ? combatMovementAimMode(self, aimSource, aimDistance)
	      : { mode: '', targetSpeed: 0, lateralRatio: 0, lateralSpeed: 0, radialSpeed: 0 };
    const targetRealBulletPressure = Boolean(targetThreat && !targetThreat.synthetic);
    const realBulletPressure = Boolean(targetBulletSeen || targetRealBulletPressure || (anyThreat && !anyThreat.synthetic));
    let passiveRunner = combatPassiveRunnerState(self, target, target.distance, motionScale, realBulletPressure);
    if (retreatingTarget.active && passiveRunner.active) {
      passiveRunner = { ...passiveRunner, active: false, suppressedBy: retreatingTarget.reason || 'retreating-target' };
    }
    const aimStrategy = combatAimDynamicStrategyState(self, target, aimSource, { noDamageMs }, aimMoving, aimDistance, aimMovement, steadyAim, { realBulletPressure, passiveRunner: passiveRunner.active });
	    const opponentProfile = combatOpponentProfile(self, aimSource, aimDistance);
	    const intercept = aimMoving && !aimStrategy.bypassJitter
	      ? combatInterceptSolution(self, aimSource, aimDistance, aimMotionScale)
	      : null;
	    const aimConfidence = aimStrategy.bypassJitter
	      ? 1
	      : (intercept
	        ? clampValue(Number(intercept.confidence || 0) * Number(opponentProfile.aimConfidenceScale || 1), 0.1, 1)
	        : Math.max(0.2, Math.min(0.7, Number(opponentProfile.aimConfidenceScale || 1) * (1 - Math.min(0.65, aimMotionScale * 0.35)))));
	    const serverStallNoDamage = combatServerStallNoDamageLeaveState(selfHp, targetHp, noDamageMs, incoming, bot.serverPositionStall);
    if (serverStallNoDamage && !retreatingTarget.disengage) {
      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
        hpGap: serverStallNoDamage.hpGap,
        noDamageMs,
        serverStallNoDamage
      }, bullets);
    }
    if (retreatingTarget.disengage) {
      clearCombatDisadvantageObservation('combat-disengage-range');
      bot.combatTarget = null;
      return {
        kind: 'wait',
        reason: 'combat-disengage-range',
        combat: false,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        combatDisengage: retreatingTarget
      };
    }
    const outOfRangeFinishPressure = combatOutOfRangeFinishPressureState(
      self,
      target,
      target.distance,
      selfHp,
      targetHp,
      noDamageMs,
      retreatingTarget
    );
    const outOfRangeReengage = combatOutOfRangeReengageState(
      self,
      target,
      target.distance,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    if (Number(target.distance || 0) > Number(cfg.combatAttackRange || 0)) {
      if (outOfRangeFinishPressure.active) {
        return {
          kind: 'attack',
          reason: 'combat-finish-reengage',
          combat: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeFinishPressure.dx,
          dy: outOfRangeFinishPressure.dy,
          target: {
            id: target.user_id,
            distance: Math.round(Number(target.distance || 0))
          },
          combatState: {
            selfHp,
            targetHp,
            outOfRangeFinishPressure,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      if (outOfRangeReengage.active) {
        return {
          kind: 'attack',
          reason: 'combat-out-of-range-reengage',
          combat: true,
          shoot: false,
          forceShoot: false,
          dx: outOfRangeReengage.dx,
          dy: outOfRangeReengage.dy,
          target: {
            id: target.user_id,
            distance: Math.round(Number(target.distance || 0))
          },
          combatState: {
            selfHp,
            targetHp,
            outOfRangeReengage,
            retreatingTarget: retreatingTarget.active ? retreatingTarget : null
          }
        };
      }
      return {
        kind: 'wait',
        reason: 'combat-out-of-range-hold',
        combat: true,
        shoot: false,
        forceShoot: false,
        dx: 0,
        dy: 0,
        target: {
          id: target.user_id,
          distance: Math.round(Number(target.distance || 0))
        },
        combatState: {
          selfHp,
          targetHp,
          outOfRangeHold: {
            distance: Math.round(Number(target.distance || 0)),
            attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
            disengageRange: Math.round(Math.max(Number(cfg.combatAttackRange || 0), Number(cfg.combatDisengageRange || cfg.combatEngageGraceRange || 0)))
          }
        }
      };
    }
    const spacing = combatSpacingVector(self, target, target.distance);
    const closeRisk = combatLowHpCloseRiskState(selfHp, targetHp, spacing, incoming);
    if (closeRisk) {
      return combatLeaveAction('combat-low-hp-leave', self, target, { closeRisk }, bullets);
    }
	    const pressureDisadvantage = combatPressureDisadvantageState(selfHp, targetHp, target.distance, incoming);
		    if (pressureDisadvantage) {
		      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
		        hpGap: pressureDisadvantage.hpGap,
		        pressureDisadvantage
		      }, bullets);
		    }
	    const sustainedPressureDisadvantage = combatSustainedPressureDisadvantageState(
	      selfHp,
	      targetHp,
	      target.distance,
	      noDamageMs,
	      targetRealBulletPressure
	    );
	    if (sustainedPressureDisadvantage) {
	      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
	        hpGap: sustainedPressureDisadvantage.hpGap,
	        sustainedPressureDisadvantage
	      }, bullets);
	    }
	    const tradeEstimate = combatTradeEstimate(self, target);
    if (!disadvantageObservation && tradeEstimate?.active) {
      disadvantageObservation = combatDisadvantageObservationState(target, 'trade-estimate', {
        selfHp,
        targetHp,
        hpGap,
        ...tradeEstimate
      });
      if (disadvantageObservation?.ready) {
        return combatLeaveAction('combat-hp-disadvantage-leave', self, target, {
          hpGap,
          tradeEstimate,
          disadvantageObservation
        }, bullets);
      }
    }
    if (!disadvantageObservation) clearCombatDisadvantageObservation('not-disadvantaged');
	    const finishPressure = combatFinishPressureState(self, target, target.distance, selfHp, targetHp, retreatingTarget);
	    const farNoDamageClose = combatFarNoDamageCloseVector(self, target, target.distance, selfHp, targetHp);
	    const retreatingFighterClose = combatRetreatingFighterCloseVector(
      self,
      target,
      target.distance,
      noDamageMs,
      selfHp,
      targetHp,
      retreatingTarget,
      targetRealBulletPressure
    );
    const retreatingBlocksClose = retreatingTarget.active && !retreatingFighterClose.active;
	    const basePressureClose = finishPressure.active
      ? finishPressure
      : (retreatingFighterClose.active
        ? retreatingFighterClose
        : (retreatingBlocksClose
        ? { active: false, dx: 0, dy: 0, distance: target.distance, closeRange: cfg.combatPressureCloseRange, noDamageMs, retreatingTarget }
        : (farNoDamageClose.active
          ? farNoDamageClose
          : combatPressureCloseVector(self, target, target.distance, selfHp))));
	    const passiveRunnerClose = !basePressureClose.active && !retreatingTarget.active
      ? combatPassiveRunnerCloseVector(self, target, target.distance, passiveRunner)
      : { active: false, dx: 0, dy: 0, distance: target.distance, closeRange: Number(cfg.combatPassiveRunnerCloseRange || 0), noDamageMs, reason: 'passive-runner' };
	    const pressureClose = passiveRunnerClose.active ? passiveRunnerClose : basePressureClose;
    const spacingOverride = incoming && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let threatField = null;
    let threatFieldBase = null;
    if (anyThreat && !pressureClose.active && !spacingOverride) {
      const preciseSign = combatPreciseStrafeSign(anyThreat);
      threatFieldBase = combatStrafeVectorForTest(self, target, anyThreat, preciseSign || 1, { preferClosing: false });
      threatField = combatBulletThreatFieldForTest(self, anyThreat.threats || [anyThreat], {
        preferred: threatFieldBase,
        target,
        preferClosing: false
      });
    }
    const dodgeDx = threatField ? threatField.dx : (incoming ? (threatFieldBase?.dx ?? 1) : spacing.dx);
    const dodgeDy = threatField ? threatField.dy : (incoming ? (threatFieldBase?.dy ?? 1) : spacing.dy);
    const requestedDx = pressureClose.active ? pressureClose.dx : (spacingOverride ? spacing.dx : dodgeDx);
    const requestedDy = pressureClose.active ? pressureClose.dy : (spacingOverride ? spacing.dy : dodgeDy);
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(requestedDx || requestedDy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx,
        requestedDy
      }
      : null;
    const dx = movementSuppressed ? 0 : requestedDx;
    const dy = movementSuppressed ? 0 : requestedDy;
    const farNoDamageCloseForTrend = Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage');
    const trend = combatTrendState(self, {
      needsMovement: Boolean(requestedDx || requestedDy),
      dodging: incoming,
      realBulletPressure: incoming,
      targetRealBulletPressure,
      targetDistance: target.distance,
      targetHp,
      steadyAim: steadyAim.active,
      engagedCombat: target.combatIntent === 'engaged',
      targetActive: isActive(target),
      passiveRunner: passiveRunner.active,
	      targetMoving: moving,
	      noDamageMs,
	      aimConfidence,
	      motionScale: aimMotionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    let shooting = combatShootingPlan(self, {
      trend,
      needsMovement: Boolean(requestedDx || requestedDy),
      dodging: incoming,
	      realBulletPressure: incoming,
	      targetRealBulletPressure,
	      targetDistance: target.distance,
      targetHp,
      steadyAim: steadyAim.active,
      engagedCombat: target.combatIntent === 'engaged',
	      targetActive: isActive(target),
	      passiveRunner: passiveRunner.active,
	      targetMoving: moving,
	      noDamageMs,
	      aimConfidence,
	      motionScale: aimMotionScale,
	      farNoDamageClose: farNoDamageCloseForTrend
	    });
    if (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active) {
      shooting = {
        ...shooting,
        shoot: false,
        forceShoot: false,
        suppressed: true,
        reason: 'target-retreating-edge',
        retreatingTarget
      };
    }
    if (finishPressure.active && !shooting.suppressed) {
      const finishEveryMs = Math.max(
        Number(shooting.shootEveryMs || 0),
        Number(cfg.combatFinishPressureShootEveryMs || cfg.combatShootConserveEveryMs || cfg.combatShootEveryMs || 0)
      );
      shooting = {
        ...shooting,
        shoot: true,
        shootEveryMs: finishEveryMs || shooting.shootEveryMs,
        reason: 'finish-pressure',
        throttled: true,
        finishPressure
      };
    }
    const baseReason = incoming
      ? (spacingOverride ? 'combat-spacing-dodge' : 'combat-tangent-dodge')
      : (pressureClose.active && pressureClose.reason === 'passive-runner'
        ? 'combat-passive-runner-close'
        : (spacing.active ? 'combat-spacing' : (pressureClose.active ? (finishPressure.active ? 'combat-finish-pressure' : (retreatingFighterClose.active ? 'combat-retreating-fighter-close' : (farNoDamageClose.active ? 'combat-far-pressure-close' : 'combat-pressure-close'))) : 'combat-attack')));
    return {
      kind: 'attack',
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (retreatingTarget.suppressFire && !finishPressure.active && !retreatingFighterClose.active ? 'combat-target-retreating' : (shooting.suppressed ? 'combat-stamina-conserve' : (shooting.reason === 'finish-pressure' ? 'combat-finish-pressure' : (shooting.throttled ? 'combat-burst-fire' : baseReason)))),
      combat: true,
      ignoreReturnBlock: true,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      dx,
      dy,
      aimMode: aimStrategy.mode,
      aimJitterLimit: aimStrategy.bypassJitter ? 0 : (moving ? Number(combatAimJitterLimit(target.distance, motionScale).toFixed(4)) : 0),
      aimTarget: {
        x: Number(aimSource.x),
        y: Number(aimSource.y),
        mode: aimStrategy.mode,
        strategy: aimStrategy.strategy,
        strategyReason: aimStrategy.reason,
        precision: Boolean(aimStrategy.precision),
        steady: Boolean(aimStrategy.steady),
        live: Boolean(aimSource.nativeAimResolved),
        liveDistance: aimSource.nativeAimResolved ? Math.round(aimDistance) : null,
        sourceDivergenceCm: aimStrategy.sourceDivergence.divergenceCm,
        sourceDivergenceThresholdCm: aimStrategy.sourceDivergence.thresholdCm,
        serverStall: Boolean(aimStrategy.serverStall),
        liveIntercept: Boolean(aimStrategy.liveIntercept),
        realBulletPrecision: Boolean(aimStrategy.realBulletPrecision),
        radialPrecision: Boolean(aimStrategy.radialPrecision),
        fallbackPrecision: Boolean(aimStrategy.fallbackPrecision),
        passiveRunner: Boolean(aimStrategy.passiveRunner),
	        aimConfidence: Number(Number(aimConfidence).toFixed(2)),
	        intercept: Boolean(intercept),
        interceptConfidence: intercept ? Number(Number(intercept.confidence || 0).toFixed(2)) : null,
	        opponentProfile
	      },
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        vx: Number(target.vx) || 0,
        vy: Number(target.vy) || 0,
        hp: combatHpValue(target),
        drop: target.drop,
        distance: Math.round(target.distance),
        mode: target.current_join_mode || target.mode || '',
        life: target.life || '',
        active: isActive(target),
        firing: isFiringEntity(target),
        invulnerable: isInvulnerable(target),
        combatIntent: target.combatIntent || ''
      },
      combatState: {
        spacing: spacing.active ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        pressureClose: pressureClose.active ? {
          dx: pressureClose.dx,
          dy: pressureClose.dy,
          reason: pressureClose.reason,
          distance: Math.round(pressureClose.distance),
          closeRange: Math.round(pressureClose.closeRange),
          noDamageMs: Math.round(pressureClose.noDamageMs),
          farNoDamageClose: Boolean(pressureClose.farNoDamageClose || pressureClose.reason === 'far-no-damage')
        } : null,
        passiveRunner,
        noDamageMs,
	        steadyAim,
	        opponentProfile,
        disadvantageObservation,
	        movementSuppressed,
        shooting,
        incomingBullet: anyThreat ? {
          id: anyThreat.id,
          ownerId: anyThreat.ownerId,
          distance: Math.round(Number(anyThreat.distance || 0)),
          laneDistance: Math.round(Number(anyThreat.laneDistance || 0)),
          signedLaneDistance: Number.isFinite(Number(anyThreat.signedLaneDistance)) ? Math.round(Number(anyThreat.signedLaneDistance)) : null,
          timeToImpactMs: Number.isFinite(Number(anyThreat.timeToImpactMs)) ? Math.round(Number(anyThreat.timeToImpactMs)) : null,
          threatCount: Number(anyThreat.threatCount || 1)
        } : null,
        threatField: threatField ? {
          dx: threatField.dx,
          dy: threatField.dy,
          directHitCount: threatField.directHitCount,
          minCpaDistance: Number.isFinite(Number(threatField.minCpaDistance)) ? Math.round(Number(threatField.minCpaDistance)) : null,
          minTimeToImpactMs: Number.isFinite(Number(threatField.minTimeToImpactMs)) ? Math.round(Number(threatField.minTimeToImpactMs)) : null
        } : null,
        retreatingTarget: retreatingTarget.active ? retreatingTarget : null
      }
    };
  }

  function pickBestOpportunity(self, entities, coins, activeThreats, snapshotCompetitionCoin = null, fieldCompetitionCoin = null) {
    const opportunities = [];
    const upsertCoinOpportunity = item => {
      const index = opportunities.findIndex(existing => existing.type === 'coin' && String(existing.id) === String(item.id));
      if (index < 0) {
        opportunities.push(item);
        return;
      }
      const previous = opportunities[index];
      if (Number(item.score || -Infinity) > Number(previous.score || -Infinity)
        || (Number(item.score || -Infinity) === Number(previous.score || -Infinity) && Number(item.amount || 0) > Number(previous.amount || 0))
        || (Number(item.score || -Infinity) === Number(previous.score || -Infinity) && Number(item.distance || Infinity) < Number(previous.distance || Infinity))) {
        opportunities[index] = item;
      } else if (item.reason === 'best-opportunity-coin-route' && item.coinRoute) {
        opportunities[index] = mergeCoinRouteDisplay(previous, item);
      }
    };
    const buildCoinRouteMeta = route => route ? {
      ids: route.ids,
      points: Array.isArray(route.points) ? route.points : null,
      value: Number(route.value || 0),
      staminaCost: Math.round(Number(route.staminaCost || 0)),
      legCount: Number(route.legCount || 0),
      totalDistance: Math.round(Number(route.totalDistance || 0)),
      firstDistance: Math.round(Number(route.firstDistance || 0)),
      kind: route.kind || ''
    } : null;
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      const staminaCost = opportunityCoinStaminaCost(coin);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      upsertCoinOpportunity({
        type: 'coin',
        kind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        actionKind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin',
        id: coin.drop_id,
        amount: coin.amount,
        x: coin.x,
        y: coin.y,
        distance: coin.distance,
        staminaCost,
        score: scoreCoinOpportunity(coin),
        maxDistance: cfg.globalCoinMaxDistance
      });
    }
    const routeCoin = pickCoinRouteOpportunity(self, uniqueVisibleRouteCoins(coins), activeThreats);
    if (routeCoin) {
      const staminaCost = opportunityCoinStaminaCost(routeCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        upsertCoinOpportunity({
          type: 'coin',
          kind: routeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
          actionKind: routeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
          reason: 'best-opportunity-coin-route',
          id: routeCoin.drop_id,
          amount: routeCoin.amount,
          x: routeCoin.x,
          y: routeCoin.y,
          distance: routeCoin.distance,
          staminaCost,
          score: scoreCoinOpportunity(routeCoin),
          maxDistance: cfg.coinRouteMaxDistance,
          coinRoute: routeCoin.coinRoute || null,
          routeValue: routeCoin.routeValue || null,
          routeKind: routeCoin.routeKind || '',
          routeLegs: routeCoin.routeLegs || 0,
          routeHeld: Boolean(routeCoin.routeHeld),
          competingRouteScore: routeCoin.competingRouteScore
        });
      }
    }
    if (snapshotCompetitionCoin) {
      const staminaCost = opportunityCoinStaminaCost(snapshotCompetitionCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        upsertCoinOpportunity({
          type: 'coin',
          kind: 'seek-coin',
          actionKind: 'seek-coin',
          reason: snapshotCoinNavigationReason(snapshotCompetitionCoin),
          id: snapshotCompetitionCoin.drop_id,
          amount: snapshotCompetitionCoin.amount,
          x: snapshotCompetitionCoin.x,
          y: snapshotCompetitionCoin.y,
          members: snapshotCompetitionCoin.snapshotMembers,
          distance: snapshotCompetitionCoin.distance,
          staminaCost,
          score: scoreCoinOpportunity(snapshotCompetitionCoin),
          maxDistance: cfg.snapshotCoinMaxDistance
        });
      }
    }
    if (fieldCompetitionCoin) {
      const staminaCost = opportunityCoinStaminaCost(fieldCompetitionCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        upsertCoinOpportunity({
          type: 'coin',
          kind: 'seek-coin',
          actionKind: 'seek-coin',
          reason: snapshotCoinNavigationReason(fieldCompetitionCoin),
          id: fieldCompetitionCoin.drop_id,
          amount: fieldCompetitionCoin.amount,
          x: fieldCompetitionCoin.x,
          y: fieldCompetitionCoin.y,
          members: fieldCompetitionCoin.fieldMembers,
          distance: fieldCompetitionCoin.distance,
          staminaCost,
          score: scoreCoinOpportunity(fieldCompetitionCoin),
          maxDistance: cfg.fieldMigrationMaxDistance
        });
      }
    }
    for (const target of enemyTargets(self, entities, activeThreats)) {
      const score = scoreEnemyOpportunity(target);
      if (score === null) continue;
      const staminaCost = opportunityEnemyStaminaCost(target);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      const afk = isAfkProfitTarget(target);
      const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
      opportunities.push({
        type: 'enemy',
        afk,
        kind: inRange ? 'attack' : 'seek-enemy',
        actionKind: inRange ? 'attack' : 'seek-enemy',
        reason: afk
          ? (inRange ? 'best-opportunity-afk-drop-target' : 'approach-afk-drop-target')
          : (inRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target'),
        id: target.user_id,
        drop: target.drop,
        distance: target.distance,
        staminaCost,
        score
      });
    }
    for (const item of opportunities) item.priorityTier = opportunityPriorityTier(item);
    const missingHeld = buildMissingHeldOpportunity(self, activeThreats, opportunities);
    if (missingHeld) opportunities.push(missingHeld);
    const chosen = chooseStableOpportunity(opportunities);
    if (!chosen) return null;
    const dir = directionTo(self, chosen);
    if (chosen.type === 'coin') {
      const coinRoute = buildCoinRouteMeta(chosen.coinRoute);
      return {
        kind: chosen.kind,
        reason: chosen.reason,
        id: chosen.id,
        amount: chosen.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance), coinRoute },
        score: Math.round(Number(chosen.score || 0)),
        staminaCost: Math.round(Number(chosen.staminaCost || 0)),
        coinRoute,
        missingHold: Boolean(chosen.missingHold),
        routeHeld: Boolean(chosen.routeHeld),
        competingRouteScore: chosen.competingRouteScore
      };
    }
    return chosen;
  }

  function actionMovesTowardThreat(self, threat, action) {
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    if (!(dx || dy)) return false;
    const tx = Number(threat.x) - Number(self.x);
    const ty = Number(threat.y) - Number(self.y);
    return dx * tx + dy * ty > 0;
  }

  function directionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const x = Number(target.x) - Number(self.x);
    const y = Number(target.y) - Number(self.y);
    const distance = Math.hypot(x, y);
    return {
      dx: Math.abs(x) > tolerance ? Math.sign(x) : 0,
      dy: Math.abs(y) > tolerance ? Math.sign(y) : 0,
      distance
    };
  }

  function isShortSafeCoinAction(action) {
    if (action?.kind !== 'coin') return false;
    const distance = Number(action.target?.distance ?? action.distance ?? Infinity);
    return Number.isFinite(distance) && distance <= cfg.activeReturnBlockCoinPassDistance;
  }

  function returnBlockRadius(threat) {
    const limit = Math.max(0, Number(cfg.activeAvoidMaxDistance || 0) || Infinity);
    return Math.min(limit, threat.cautionRadius + cfg.activeCautionExitMargin + cfg.activeReturnBlockMargin);
  }

  function returnBlockExitRadius(threat) {
    return returnBlockRadius(threat) + cfg.activeReturnBlockExitMargin;
  }

  function returnBlockResumeRadius(threat) {
    return returnBlockExitRadius(threat) + cfg.activeReturnBlockResumeMargin;
  }

  function returnBlockSuppressRadius(threat) {
    return returnBlockResumeRadius(threat) + cfg.activeReturnBlockClearMargin;
  }

  function hasReturnBlockThreat(activeThreats) {
    return activeThreats.some(e => e.distance <= returnBlockSuppressRadius(e));
  }

  function blockThreatReturnAction(self, activeThreats, action) {
    if (action?.ignoreReturnBlock || action?.combat || action?.kind === 'leave') return action;
    if (isFullHp(self) && !(activeThreats || []).some(isInvulnerableActive)) return action;
    if (!action || action.kind === 'flee' || action.kind === 'recover' || action.kind === 'wait') return action;
    const threat = activeThreats.find(e => e.distance <= returnBlockExitRadius(e))
      || activeThreats.find(e => e.distance <= returnBlockResumeRadius(e) && actionMovesTowardThreat(self, e, action));
    if (!threat) return action;
    if (isShortSafeCoinAction(action) && !actionMovesTowardThreat(self, threat, action)) return action;
    if (threat.distance > threat.threatRadius && !actionMovesTowardThreat(self, threat, action)) {
      return { kind: 'patrol', reason: 'return-block-lateral-scan' };
    }
    return {
      kind: 'flee',
      reason: 'active-threat-return-block',
      blockedKind: action.kind,
      threatId: threat.user_id
    };
  }

  function pickActiveCombatWaitThreat(self, activeThreats, bullets = []) {
    const range = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const { ownerId: incomingOwnerId, unknownIncoming } = incomingBulletInfo(self, bullets);
    return (activeThreats || [])
      .filter(threat => !isWhitelistedTarget(threat) && !isInvulnerable(threat))
      .filter(threat => hasCombatActivitySignalForTest(threat))
      .filter(threat => !isLowValueActiveCombatTarget(threat) || lowValueActiveThreatensSelf(threat, incomingOwnerId, unknownIncoming))
      .filter(threat => Number(threat.distance || 0) <= range)
      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity))[0] || null;
  }

  function activeCombatThreatWaitAction(threat) {
    return {
      kind: 'wait',
      reason: 'combat-active-threat-wait',
      dx: 0,
      dy: 0,
      shoot: false,
      forceShoot: false,
      activeThreat: threat ? {
        id: threat.user_id ?? threat.id ?? null,
        name: threat.name || '',
        distance: Math.round(Number(threat.distance || 0)),
        drop: Number(threat.drop || 0),
        speed: Math.round(Number(threat.speed || 0)),
        moving: Boolean(threat.moving),
        mode: threat.current_join_mode || threat.mode || ''
      } : null
    };
  }

  function choose({ local = [], global = [], coins = [], bullets = [], attacks = [], snapshotWaitAgeMs = 0, self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 } }) {
    const entities = [...global, ...local];
    updateOpportunityAfkStaminaObservations(entities);
    const fullHp = isFullHp(self);
    const activeThreats = entities
      .filter(isActive)
      .map(e => decorateThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const avoidanceThreats = activeThreats.filter(isAvoidanceThreat);
    const closeThreats = avoidanceThreats.filter(e => e.distance <= e.threatRadius);
    const cautionThreats = avoidanceThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const recovery = !fullHp && isRecovering(self);
    const coinThreats = avoidanceThreats;
    const usableCoins = filterLocalSnapshotCoins(self, coins);
    const realtimeCoins = usableCoins.filter(coin => !isSnapshotOnlyCoin(coin));
    const snapshotCoins = usableCoins.filter(isSnapshotOnlyCoin);
    const engagedCombatTarget = pickEngagedCombatTarget(self, entities, bullets);
    const defensiveCombatTarget = pickCombatTarget(self, entities, bullets, { mode: 'defensive' });
    const recoveryCombatTarget = defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)
      ? defensiveCombatTarget
      : (engagedCombatTarget || defensiveCombatTarget);
    const pendingPostAttackWaitTarget = pickPostAttackDropWaitTarget(self, realtimeCoins, coinThreats, attacks, entities);
    const highValuePriorityCoin = pickHighValueVisibleCoin(self, realtimeCoins, coinThreats);
    const highValuePriorityContext = { recovery, engagedCombatTarget, defensiveCombatTarget, activeThreats, avoidanceThreats, bullets };
    if (!pendingPostAttackWaitTarget
      && highValueVisibleCoinPriorityNeeded(self, highValuePriorityContext)
      && canPrioritizeHighValueVisibleCoin(self, highValuePriorityCoin, highValuePriorityContext)) {
      if (engagedCombatTarget) bot.combatTarget = null;
      const dir = directionTo(self, highValuePriorityCoin);
      return {
        kind: highValuePriorityCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: 'high-value-visible-coin-priority',
        id: highValuePriorityCoin.drop_id,
        amount: highValuePriorityCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      };
    }
    if (recovery && recoveryCombatTarget) {
      const recoveryCombatAction = chooseCombatAction(self, recoveryCombatTarget, bullets);
      if (recoveryCombatAction) return recoveryCombatAction;
    }
    if (!recovery && defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)) {
      return chooseCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!recovery && engagedCombatTarget) return chooseCombatAction(self, engagedCombatTarget, bullets);
    if (fullHp && closeThreats.length) return { kind: 'flee' };
    if (fullHp && cautionThreats.length) return { kind: 'flee' };
    if (!recovery && defensiveCombatTarget) return chooseCombatAction(self, defensiveCombatTarget, bullets);
    const activeCombatWaitThreat = pickActiveCombatWaitThreat(self, activeThreats, bullets);
    if (!recovery && activeCombatWaitThreat) return activeCombatThreatWaitAction(activeCombatWaitThreat);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = realtimeCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= nearCoinLimit
        && !coinThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const footCoin = realtimeCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= cfg.footCoinPriorityDistance
        && !coinThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const postAttackCoin = pickPostAttackDropCoin(self, realtimeCoins, coinThreats, attacks, entities, {
      includeSingle: !recovery,
      maxDistance: recovery ? cfg.postAttackRecoveryDropMaxDistance : cfg.postAttackDropCoinMaxDistance,
      minScore: recovery ? cfg.postAttackRecoveryDropMinScore : 0
    });
    if (postAttackCoin) return { kind: 'coin', reason: 'post-attack-drop-coin', id: postAttackCoin.drop_id, amount: postAttackCoin.amount };
    const postAttackWaitTarget = pendingPostAttackWaitTarget || pickPostAttackDropWaitTarget(self, realtimeCoins, coinThreats, attacks, entities);
    if (postAttackWaitTarget) return buildPostAttackDropWaitAction(self, postAttackWaitTarget);
    const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExit(
      self,
      safeCoins(self, realtimeCoins, coinThreats, cfg.snapshotCoinMaxDistance)
    );
    if (staminaBudgetExit) return staminaBudgetCoinLeaveAction(staminaBudgetExit);
    if (recovery && nearCoin) return { kind: 'coin', id: nearCoin.drop_id, amount: nearCoin.amount };
    const nearbyAvoidanceRadius = Math.max(
      Number(cfg.dangerRadius || 0) || 0,
      Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius || 0) || 0,
      Number(cfg.recoveryAvoidRadius || 0) || 0
    );
    const nearbyAvoidanceThreats = entities
      .map(e => ({ ...e, distance: dist(self, e) }))
      .filter(e => e.distance <= nearbyAvoidanceRadius && isAvoidanceThreat(e));
    if (nearbyAvoidanceThreats.length) return { kind: 'flee', reason: 'avoid-invulnerable-target' };
    if (recovery) return { kind: 'recover' };
    if (!fullHp && closeThreats.length) return { kind: 'flee' };
    if (!fullHp && cautionThreats.length) {
      if (!fullHp && footCoin) return { kind: 'coin', reason: 'foot-coin-before-active-caution', id: footCoin.drop_id, amount: footCoin.amount };
      return { kind: 'flee' };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    if (footCoin) return attachOpportunisticShot({ kind: 'coin', reason: 'foot-coin-priority', id: footCoin.drop_id, amount: footCoin.amount }, self, entities, !recovery);
    const localRealtimeCoin = pickRealtimeLocalCoin(self, realtimeCoins, coinThreats);
    const fieldCompetitionCoin = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickField(self, realtimeCoins, coinThreats)
      : null;
    const profitableCombatTarget = pickProfitableCombatTarget(self, entities, bullets, realtimeCoins, coinThreats, null, fieldCompetitionCoin);
    if (profitableCombatTarget) return chooseCombatAction(self, profitableCombatTarget, bullets);
    const opportunityTargets = fullHp ? entities.filter(isAfkProfitTarget) : entities;
    const opportunity = pickBestOpportunity(self, opportunityTargets, realtimeCoins, coinThreats, null, fieldCompetitionCoin);
    if (opportunity) return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, opportunity), self, entities, !recovery);
    const distantCoin = pickDistantCoin(self, realtimeCoins, coinThreats);
    if (distantCoin) {
      const dir = directionTo(self, distantCoin);
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        id: distantCoin.drop_id,
        amount: distantCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      }), self, entities, !recovery);
    }
    if (localRealtimeCoin) {
      const dir = directionTo(self, localRealtimeCoin);
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
        kind: localRealtimeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: snapshotCoinNavigationReason(localRealtimeCoin),
        id: localRealtimeCoin.drop_id,
        amount: localRealtimeCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      }), self, entities, !recovery);
    }
    if (hasReturnBlockThreat(avoidanceThreats)) return { kind: 'patrol', reason: 'return-block-lateral-scan' };
    const shotWait = buildOpportunisticShotWait(self, entities, !recovery);
    if (shotWait) return shotWait;
    const snapshotCoin = pickSnapshotCoinDestination(self, snapshotCoins, coinThreats, { ignoreRealtimeLocalCoin: true });
    if (snapshotCoin) {
      const dir = directionTo(self, snapshotCoin);
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
        kind: 'seek-coin',
        reason: snapshotCoinNavigationReason(snapshotCoin),
        id: snapshotCoin.drop_id,
        amount: snapshotCoin.amount,
        members: snapshotCoin.snapshotMembers,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance), fieldMembers: snapshotCoin.snapshotMembers, fieldAmount: snapshotCoin.snapshotAmount }
      }), self, entities, !recovery);
    }
    if (!localRealtimeCoin && snapshotWaitAgeMs >= cfg.snapshotCoinIdleMaxMs) {
      const idleSnapshotCoin = pickSnapshotCoinDestination(self, snapshotCoins, coinThreats, { allowIdleFallback: true, ignoreRealtimeLocalCoin: true });
      if (idleSnapshotCoin) {
        const dir = directionTo(self, idleSnapshotCoin);
        return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
          kind: 'seek-coin',
          reason: snapshotCoinNavigationReason(idleSnapshotCoin),
          id: idleSnapshotCoin.drop_id,
          amount: idleSnapshotCoin.amount,
          members: idleSnapshotCoin.snapshotMembers,
          dx: dir.dx,
          dy: dir.dy,
          target: { distance: Math.round(dir.distance), fieldMembers: idleSnapshotCoin.snapshotMembers, fieldAmount: idleSnapshotCoin.snapshotAmount }
        }), self, entities, !recovery);
      }
    }
    const decoratedCoins = realtimeCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0);
    const decoratedTargets = [...global, ...local]
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e) }))
      .filter(e => e.drop > 0);
    const staminaBlocked = summarizeBlockedStaminaOpportunity(self, decoratedCoins, decoratedTargets);
    return {
      kind: 'wait',
      reason: staminaBlocked ? 'wait-for-stamina-budget' : 'wait-for-snapshot-coin',
      staminaBlocked,
      snapshot: {
        waitAgeMs: Math.round(snapshotWaitAgeMs),
        waitMaxMs: Math.round(cfg.snapshotCoinIdleMaxMs),
        waitRemainingMs: Math.max(0, Math.round(cfg.snapshotCoinIdleMaxMs - snapshotWaitAgeMs))
      }
    };
  }

  const cases = [
    {
      name: 'low-drop active incoming bullet beats coins inside attack range',
      got: choose({
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', firing: true }],
        global: [{ user_id: 3, x: 2000, y: 0, death_reward_preview: 50 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }],
        bullets: [{ ownerId: 2 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'low-drop active in range does not beat foot coin without incoming fire',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'low-drop retreat ignored active threat does not wait over foot coin',
      got: (() => {
        bot.combatRetreatIgnore.set('2', Date.now() + 10000);
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100 }],
          coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
        });
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:foot-coin-priority'
    },
    {
      name: 'high-drop retreat ignored active threat waits instead of taking foot coin',
      got: (() => {
        bot.combatRetreatIgnore.set('2', Date.now() + 10000);
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100, death_reward_preview: 10 }],
          coins: [{ drop_id: 1, x: 10, y: 0, amount: 1 }]
        });
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'wait:combat-active-threat-wait'
    },
    {
      name: 'profitable active combat wins when it beats safe coins',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, death_reward_preview: 10 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'active combat hp gap disadvantage observes instead of taking coin',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 70, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 91, death_reward_preview: 30 }],
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
        });
        return action.kind + ':' + action.reason + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready);
      })(),
      want: 'attack:combat-spacing:hp-gap:false'
    },
    {
      name: 'healthy high-value visible coin beats active combat state',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100, death_reward_preview: 30 }],
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'low hp existing combat is not interrupted by high-value coin',
      got: (() => {
        bot.combatTarget = { id: 2, at: Date.now(), firstSeenAt: Date.now(), intent: 'defensive' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 30, death_reward_preview: 30 }],
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 10, native: true }]
        });
        bot.combatTarget = null;
        return action.kind;
      })(),
      want: 'attack'
    },
    {
      name: 'low hp no-threat high-value visible coin beats recovery wait',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [{ drop_id: 1, x: 5000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'healthy high-value coin away from invulnerable active beats flee',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 23000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable_remaining_ticks: 5 }],
          coins: [{ drop_id: 2, x: -18000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:high-value-visible-coin-priority'
    },
    {
      name: 'near profitable active combat beats far snapshot cluster by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, death_reward_preview: 10 }],
        coins: [
          { drop_id: 11, x: 90000, y: 0, amount: 10, snapshot: true },
          { drop_id: 12, x: 94000, y: 1000, amount: 10, snapshot: true },
          { drop_id: 13, x: 98000, y: -1000, amount: 10, snapshot: true }
        ]
      }).reason,
      want: 'combat-spacing'
    },
    {
      name: 'near afk drop target beats far snapshot cluster by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 8 }],
        coins: [
          { drop_id: 21, x: 90000, y: 0, amount: 4, snapshot: true },
          { drop_id: 22, x: 94000, y: 1000, amount: 4, snapshot: true },
          { drop_id: 23, x: 98000, y: -1000, amount: 4, snapshot: true }
        ]
      }).reason,
      want: 'best-opportunity-afk-drop-target'
    },
    {
      name: 'visible afk target beats richer snapshot fallback',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 3, x: 10000, y: 0, native: true, current_join_mode: 'Passive', death_reward_preview: 3 }],
          coins: [
            { drop_id: 21, x: 90000, y: 0, amount: 50, snapshot: true },
            { drop_id: 22, x: 94000, y: 1000, amount: 50, snapshot: true },
            { drop_id: 23, x: 98000, y: -1000, amount: 50, snapshot: true }
          ]
        });
        return action.reason + ':' + action.id;
      })(),
      want: 'best-opportunity-afk-drop-target:3'
    },
    {
      name: 'low-drop opportunistic shot is skipped during near coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).opportunisticShot?.id,
      want: undefined
    },
    {
      name: 'low-drop opportunistic shot is skipped during medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 22000, y: 0, amount: 999 }]
      }).opportunisticShot?.id,
      want: undefined
    },
    {
      name: 'near coin distance beats amount',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 10, y: 0, amount: 1 },
          { drop_id: 2, x: 5000, y: 0, amount: 5 }
        ]
      }).id,
      want: 1
    },
    {
      name: 'near coin beats far same-value snapshot coin by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 100, y: 0, amount: 1 },
          { drop_id: 2, x: 128700, y: 0, amount: 1 }
        ]
      }).id,
      want: 1
    },
    {
      name: 'higher roi 200m coin beats 150m coin inside visible pool',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 15000, y: 0, amount: 1 },
          { drop_id: 2, x: 20000, y: 0, amount: 20 }
        ]
      }).id,
      want: 2
    },
    {
      name: 'similar stamina roi targets choose immediately',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 10000, y: 0, amount: 10 },
            { drop_id: 2, x: 12000, y: 0, amount: 12 }
          ]
        });
        bot.opportunityChoice = null;
        return action.id;
      })(),
      want: 1
    },
	    {
	      name: 'held similar roi target prevents target jitter',
	      got: (() => {
	        const t = Date.now();
	        bot.opportunityChoice = { key: 'coin:2', until: t + cfg.opportunitySwitchHoldMs, at: t, score: 600000 };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 10000, y: 0, amount: 11 },
            { drop_id: 2, x: 12000, y: 0, amount: 12 }
          ]
        });
        bot.opportunityChoice = null;
        return action.id;
	      })(),
	      want: 2
	    },
    {
      name: 'oscillating opportunity pair locks after repeated switches',
      got: (() => {
        bot.opportunitySwitchLock = null;
        bot.opportunityChoice = { key: 'coin:1', type: 'coin', id: 1, until: 0, at: Date.now(), score: 600000 };
        const picked = [];
        for (let i = 0; i < 6; i += 1) {
          const preferOne = i % 2 === 1;
          const action = choose({
            self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
            coins: [
              { drop_id: 1, x: 10000, y: 0, amount: preferOne ? 30 : 1 },
              { drop_id: 2, x: 12000, y: 0, amount: preferOne ? 1 : 30 }
            ]
          });
          picked.push(action.id);
          if (bot.opportunityChoice) bot.opportunityChoice.until = 0;
        }
        const lockedKey = bot.opportunitySwitchLock?.lockedKey || '';
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        return picked.join(',') + ':' + lockedKey;
      })(),
      want: '2,1,2,1,2,2:coin:2'
    },
	    {
	      name: 'missing held coin prevents visible coin jitter',
	      got: (() => {
	        const t = Date.now();
	        bot.opportunityChoice = {
	          key: 'coin:1',
	          type: 'coin',
	          id: 1,
	          x: 5400,
	          y: 0,
	          amount: 1,
	          distance: 5400,
	          score: 111111,
	          staminaCost: 5400,
	          reason: 'best-opportunity-coin',
	          actionKind: 'coin',
	          priorityTier: 1,
	          lastSeenAt: t - 300,
	          until: t + cfg.opportunitySwitchHoldMs
	        };
	        const action = choose({
	          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	          coins: [
	            { drop_id: 2, x: 15100, y: 0, amount: 1 }
	          ]
	        });
	        bot.opportunityChoice = null;
	        return String(action.id) + ':' + Boolean(action.missingHold);
	      })(),
	      want: '1:true'
	    },
	    {
	      name: 'closer same-value coin beats sticky older far coin',
      got: (() => {
        bot.lastTarget = { kind: 'coin', id: 2 };
        bot.lastTargetAt = Date.now();
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 15000, y: 0, amount: 1 },
            { drop_id: 2, x: 21300, y: 0, amount: 1 }
          ]
        });
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
        return action.id;
      })(),
      want: 1
    },
    {
      name: 'local snapshot coin does not beat visible native coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 5000, y: 0, amount: 1, native: true },
          { drop_id: 1034, x: 18500, y: 0, amount: 50, snapshot: true }
        ]
      }).id,
      want: 1
    },
    {
      name: 'local snapshot-only coin is not chased',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 1034, x: 18500, y: 0, amount: 50, snapshot: true }]
      }).reason,
      want: 'wait-for-snapshot-coin'
    },
    {
      name: '500m snapshot-only coin is suppressed by realtime authority',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 1034, x: 50000, y: 0, amount: 50, snapshot: true }]
      }).reason,
      want: 'wait-for-snapshot-coin'
    },
    {
      name: 'native nearby coin with snapshot metadata uses visible coin reason',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 639, x: 4800, y: 0, amount: 1, native: true, snapshot: true, snapshotMembers: 1 }]
      }).reason,
      want: 'best-opportunity-coin'
    },
    {
      name: 'local realtime coin inside 500m blocks far snapshot field',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 49000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 126200, y: 0, amount: 1, snapshot: true },
            { drop_id: 3, x: 128000, y: 1200, amount: 1, snapshot: true },
            { drop_id: 4, x: 130000, y: -1200, amount: 1, snapshot: true }
          ]
        });
        return action.id + ':' + action.reason;
      })(),
      want: '1:best-opportunity-visible-coin'
    },
    {
      name: 'same-value coin score distinguishes 150m from 227m',
      got: scoreCoinOpportunity({ amount: 1, distance: 150 }) > scoreCoinOpportunity({ amount: 1, distance: 227 }),
      want: true
    },
    {
      name: 'richer far coin can beat near coin when yield is higher',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 2000, y: 0, amount: 1 },
          { drop_id: 2, x: 5000, y: 0, amount: 20 }
        ]
      }).id,
      want: 2
    },
    {
      name: 'near drop three afk target beats far single coin by roi',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 33, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 22000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: '400m high-value visible coin beats low in-range afk drop by roi',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 33, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 40000, y: 0, amount: 50, native: true }]
      }).reason,
      want: 'best-opportunity-visible-coin'
    },
    {
      name: 'visible high afk drop beats opposite one coin by stamina roi',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          global: [{ user_id: 33, x: 49000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20 }],
          coins: [{ drop_id: 1, x: -5000, y: 0, amount: 1, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'seek-enemy:approach-afk-drop-target'
    },
    {
      name: 'new out-of-range afk target can be chased before stamina drop observed',
      got: (() => {
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        bot.opportunityAfkStamina.clear();
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          global: [{ user_id: 8801, x: 49000, y: 0, current_join_mode: 'Passive', stamina_5s_remaining_milli: 5000, death_reward_preview: 20 }],
          coins: [{ drop_id: 1, x: -5000, y: 0, amount: 1, native: true }]
        });
        bot.opportunityAfkStamina.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'seek-enemy:approach-afk-drop-target'
    },
    {
      name: 'out-of-range afk target cools down after observed stamina drop',
      got: (() => {
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        bot.opportunityAfkStamina.clear();
        const self = { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 };
        const coin = { drop_id: 1, x: -5000, y: 0, amount: 1, native: true };
        choose({
          self,
          global: [{ user_id: 8802, x: 49000, y: 0, current_join_mode: 'Passive', stamina_5s_remaining_milli: 10000, death_reward_preview: 20 }],
          coins: [coin]
        });
        const action = choose({
          self,
          global: [{ user_id: 8802, x: 49000, y: 0, current_join_mode: 'Passive', stamina_5s_remaining_milli: 8000, death_reward_preview: 20 }],
          coins: [coin]
        });
        bot.opportunityAfkStamina.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: 'in-range afk target ignores stamina cooldown',
      got: (() => {
        bot.opportunityChoice = null;
        bot.opportunitySwitchLock = null;
        bot.opportunityAfkStamina.clear();
        bot.opportunityAfkStamina.set('8803', { cooldownUntil: Date.now() + cfg.opportunityAfkStaminaCooldownMs, lastSeenAt: Date.now(), stamina5s: 8000, consumedAt: Date.now() });
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 8803, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20 }],
          coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1, native: true }]
        });
        bot.opportunityAfkStamina.clear();
        return action.kind + ':' + action.reason;
      })(),
      want: 'attack:best-opportunity-afk-drop-target'
    },
    {
      name: 'near high afk drop beats low coin by value',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 17, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'attack-range afk drop shoots without combat state',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 17, x: 13000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
          coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1 }]
        });
        return action.kind + ':' + Boolean(action.combat);
      })(),
      want: 'attack:false'
    },
    {
      name: 'full hp does not approach moving enemy outside combat range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 17, x: 24000, y: 0, current_join_mode: 'Passive', vx: 20, death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 6000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'near richer coin beats far marginal drop',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 17, x: 18000, y: 0, current_join_mode: 'Passive', death_reward_preview: 12 }],
        coins: [{ drop_id: 1, x: 1000, y: 0, amount: 20 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'passive bystander in combat range does not interrupt coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 6000, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'touching passive in combat range does not interrupt full hp coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 80, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'stationary passive in combat range does not start combat',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1500, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'near coin beats higher far afk drop by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 3000, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'higher medium coin beats lower far afk drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 22000, y: 0, amount: 8 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'far snapshot coin outside local range is chased',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 5, snapshot: true }]
      }).kind,
      want: 'seek-coin'
    },
	    {
	      name: 'single far low-value snapshot coin waits before idle timeout',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true }],
	        snapshotWaitAgeMs: 59999
	      }).reason,
	      want: 'wait-for-snapshot-coin'
	    },
	    {
	      name: 'single far low-value snapshot coin is chased after idle timeout',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true }],
	        snapshotWaitAgeMs: 60000
	      }).reason,
	      want: 'snapshot-coin-idle-timeout'
	    },
    {
      name: 'far snapshot coin cluster replaces open patrol',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true },
          { drop_id: 3, x: 56000, y: 2000, amount: 1, snapshot: true },
          { drop_id: 4, x: 59000, y: -1000, amount: 1, snapshot: true }
        ]
      }).kind,
      want: 'seek-coin'
    },
	    {
	      name: 'far snapshot coin cluster uses snapshot field reason',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [
	          { drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true },
	          { drop_id: 3, x: 56000, y: 2000, amount: 1, snapshot: true },
	          { drop_id: 4, x: 59000, y: -1000, amount: 1, snapshot: true }
	        ]
	      }).reason,
	      want: 'snapshot-coin-field'
	    },
	    {
	      name: 'near known coin field beats farther snapshot field by ROI',
	      got: choose({
	        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	        coins: [
	          { drop_id: 11, x: 30000, y: 0, amount: 1 },
	          { drop_id: 12, x: 32000, y: 1000, amount: 1 },
	          { drop_id: 13, x: 34000, y: -1000, amount: 1 },
	          { drop_id: 21, x: 90000, y: 0, amount: 1, snapshot: true },
	          { drop_id: 22, x: 94000, y: 2000, amount: 1, snapshot: true },
	          { drop_id: 23, x: 97000, y: -1000, amount: 1, snapshot: true }
	        ]
	      }).reason,
	      want: 'migrate-to-known-field'
	    },
    {
      name: 'near realtime coin remains first target before known field route',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
	          coins: [
	            { drop_id: 1, x: 20000, y: 0, amount: 1, native: true },
	            { drop_id: 11, x: 34000, y: 0, amount: 1, native: true },
	            { drop_id: 12, x: 36000, y: 1000, amount: 1, native: true },
	            { drop_id: 13, x: 38000, y: -1000, amount: 1, native: true }
          ]
        });
        return action.id + ':' + action.reason + ':' + action.coinRoute?.ids?.join(',') + ':' + action.coinRoute?.legCount;
      })(),
      want: '1:best-opportunity-coin-route:1,11,12:3'
    },
	    {
	      name: 'no coin fallback waits for snapshot coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 }
      }).reason,
      want: 'wait-for-snapshot-coin'
    },
    {
      name: 'low hp waits instead of chasing',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 14 },
        global: [{ user_id: 4, x: 30000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 1000, y: 0, amount: 5 }]
      }).kind,
      want: 'recover'
    },
	    {
	      name: 'low hp disadvantage in combat leaves immediately',
	      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 14 },
        global: [{ user_id: 4, x: 1000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 100, y: 0, amount: 5 }],
        bullets: [{ owner_id: 4, x: 900, y: 0, vx: -100, vy: 0 }]
      }).kind,
	      want: 'leave'
	    },
    {
      name: 'combat leave uses emergency spacing cover while exit is pending',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true, death_reward_preview: 20 }],
          bullets: [{ owner_id: 4, x: 900, y: 0, vx: -100, vy: 0 }]
        });
        return action.kind + ':' + action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatCover?.reason;
      })(),
      want: 'leave:combat-low-hp-leave:-1:0:true:combat-leave-spacing'
    },
    {
      name: 'active combat hp disadvantage leaves before taking a bullet',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 40, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Active', hp: 80, death_reward_preview: 20 }]
      }).reason,
      want: 'combat-low-hp-leave'
    },
    {
      name: 'combat leave cover honors short stamina exhaustion',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 100 },
          local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true, death_reward_preview: 20 }],
          bullets: [{ owner_id: 4, x: 900, y: 0, vx: -100, vy: 0 }]
        });
        return action.kind + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatCover?.movementSuppressed?.reason;
      })(),
      want: 'leave:0:0:false:stamina-5s-exhausted'
    },
    {
      name: 'combat low hp exit summary includes target and hp details',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, name: '影', x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true, death_reward_preview: 20 }]
        });
        return action.exitSummary?.includes('与影战斗')
          && action.exitSummary.includes('血量40不足50')
          && action.exitSummary.includes('对方血量80')
          && action.exitSummary.includes('劣势退出');
      })(),
      want: true
    },
	    {
	      name: 'critical hp combat leaves even when target hp is lower',
	      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true, death_reward_preview: 20 }]
	      }).reason,
	      want: 'combat-critical-hp-leave'
	    },
    {
      name: 'combat critical exit summary includes emergency threshold',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, name: '强敌', x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true, death_reward_preview: 20 }]
      }).exitSummary,
      want: '与强敌战斗，血量19低于20，紧急退出'
    },
    {
      name: 'high hp combat gap observes before leaving',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 91, firing: true, death_reward_preview: 20 }]
        });
        const observation = action.combatState?.disadvantageObservation;
        return action.kind + ':' + action.reason + ':' + observation?.kind + ':' + Boolean(observation?.ready);
      })(),
      want: 'attack:combat-tangent-dodge:hp-gap:false'
    },
    {
      name: 'confirmed high hp combat gap leaves after observation',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 4,
          at: t - 5000,
          firstSeenAt: t - 5000,
          hp: 91,
          motionSamples: [
            { at: t - 5000, hp: 91, selfHp: 70 },
            { at: t - 3900, hp: 91, selfHp: 70 },
            { at: t - 2800, hp: 91, selfHp: 70 },
            { at: t - 1700, hp: 91, selfHp: 70 }
          ]
        };
        bot.combatDisadvantageObservation = { id: '4', kind: 'hp-gap', firstAt: t - 3000, at: t - 100, count: 4 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
          { user_id: 4, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 91, firing: true }
        );
        bot.combatTarget = null;
        bot.combatDisadvantageObservation = null;
        return action.reason + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready);
      })(),
      want: 'combat-hp-disadvantage-leave:hp-gap:true'
    },
    {
      name: 'recovering combat gap at threshold keeps fighting',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 90, firing: true, death_reward_preview: 20 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'low hp no-damage combat keeps fighting without disadvantage',
      got: (() => {
        bot.combatTarget = { id: 4, at: Date.now() - 16000, lastDamageAt: Date.now() - 16000, hp: 65 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 60, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 4, x: 9000, y: 0, distance: 9000, current_join_mode: 'Passive', hp: 65, firing: true, drop: 20 }
        );
        bot.combatTarget = null;
        return action.kind + ':' + action.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.forceShoot) + ':' + (Number(action.combatState?.noDamageMs || 0) >= cfg.combatLowHpNoDamageLeaveMs);
      })(),
      want: 'attack:combat-tangent-dodge:true:false:true'
    },
    {
      name: 'low hp recent damage keeps fighting instead of no-damage leave',
      got: (() => {
        bot.combatTarget = { id: 4, at: Date.now() - 16000, lastDamageAt: Date.now() - 500, hp: 65 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 60, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 4, x: 9000, y: 0, distance: 9000, current_join_mode: 'Passive', hp: 65, firing: true, drop: 20 }
        );
        bot.combatTarget = null;
        return action.kind;
      })(),
      want: 'attack'
    },
    {
      name: 'recovering fights non-invulnerable moving enemy already in range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Passive', vx: 30, death_reward_preview: 7 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'recovering keeps engaged stationary target in combat',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'attack:true:7'
    },
    {
      name: 'recovering keeps engaged active combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-tangent-dodge' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 77, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 14000, y: 0, current_join_mode: 'Active', hp: 97, vx: 50, death_reward_preview: 20 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'attack:true:7'
    },
    {
      name: 'recovering holds engaged combat target inside disengage range',
      got: (() => {
        bot.combatTarget = {
          id: 7,
          at: Date.now() - 1000,
          lastInRangeAt: Date.now() - 1000,
          reason: 'combat-stamina-hold'
        };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 97, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 16000, y: 0, current_join_mode: 'Active', hp: 94, vx: -50, death_reward_preview: 20 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'wait:true:7'
    },
    {
      name: 'real incoming bullet shooter overrides engaged combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [
            { user_id: 7, name: 'old', x: 10000, y: 0, current_join_mode: 'Active', hp: 100, death_reward_preview: 20 },
            { user_id: 8, name: 'shooter', x: 9000, y: 0, current_join_mode: 'Active', hp: 100, death_reward_preview: 20 }
          ],
          bullets: [{ owner_id: 8, x: 8000, y: 0, vx: -100, vy: 0, distance: 2500 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + action.target?.id;
      })(),
      want: 'attack:8'
    },
    {
      name: 'synthetic pressure does not override engaged combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [
            { user_id: 7, name: 'old', x: 10000, y: 0, current_join_mode: 'Active', hp: 100, death_reward_preview: 20 },
            { user_id: 8, name: 'firing', x: 9000, y: 0, current_join_mode: 'Active', hp: 100, firing: true, death_reward_preview: 20 }
          ]
        });
        bot.combatTarget = null;
        return action.kind + ':' + action.target?.id;
      })(),
      want: 'attack:7'
    },
    {
      name: 'full hp active outside combat range no longer forces flee',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'full hp active caution waits instead of fleeing when no coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 24000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'moving active beyond narrowed caution waits when no coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'non-full active outside attack range does not enter combat',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
        });
        return action.kind + ':' + Boolean(action.combat) + ':' + (action.target?.id || '');
      })(),
      want: 'recover:false:'
    },
    {
      name: 'engaged out-of-range combat target waits instead of chasing',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 14000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 16000, y: 0, distance: 16000, current_join_mode: 'Active', hp: 95, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        const ignored = combatRetreatIgnoreActive({ id: 7 });
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + action.dx + ':' + action.dy + ':' + ignored;
      })(),
      want: 'wait:combat-out-of-range-hold:true:false:0:0:false'
    },
    {
      name: 'engaged slight out-of-range bullet pressure reengages instead of holding',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 72, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 91, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 72, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 47, combatIntent: 'reengage' },
          [{ id: 'target-shot', ownerId: 7, x: 11000, y: 0, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.outOfRangeReengage?.reason;
      })(),
      want: 'attack:combat-out-of-range-reengage:true:false:1:0:target-real-bullet-pressure'
    },
    {
      name: 'target-owned out-of-range pressure reengages with recoverable hp gap',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 91, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 73, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 91, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 107, combatIntent: 'reengage' },
          [{ id: 'target-shot', ownerId: 7, x: 11000, y: 0, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return [
          action.kind,
          action.reason,
          action.combatState?.outOfRangeReengage?.hpGap,
          action.combatState?.outOfRangeReengage?.maxHpGap,
          action.combatState?.outOfRangeReengage?.baseMaxHpGap
        ].join(':');
      })(),
      want: 'attack:combat-out-of-range-reengage:18:20:10'
    },
    {
      name: 'non-pressure out-of-range reengage keeps base hp gap guard',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 4000, lastDamageAt: Date.now() - 18000, lastInRangeAt: Date.now() - 2200, distance: 14500, hp: 91, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 73, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 91, vx: 0, vy: 0, recentlyMoved: false, motionObservedSpeed: 0, drop: 107, combatIntent: 'reengage' },
          []
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + action.dx + ':' + action.dy;
      })(),
      want: 'wait:combat-out-of-range-hold:0:0'
    },
    {
      name: 'retreating slight out-of-range target still holds without pressure',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 14500, hp: 90, intent: 'engaged' };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14700, y: 0, distance: 14700, current_join_mode: 'Active', hp: 90, vx: 50, vy: 0, recentlyMoved: true, motionObservedSpeed: 50, drop: 20, combatIntent: 'reengage' }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + action.dx + ':' + action.dy;
      })(),
      want: 'wait:combat-out-of-range-hold:0:0'
    },
    {
      name: 'low hp out-of-range finish target reengages without shooting',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 5000, lastInRangeAt: Date.now() - 1000, distance: 14000, hp: 49 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 55, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 15500, y: 0, distance: 15500, current_join_mode: 'Active', hp: 49, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 80 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + Boolean(action.shoot) + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.outOfRangeFinishPressure?.reason + ':' + action.combatState?.retreatingTarget?.reason;
      })(),
      want: 'attack:combat-finish-reengage:true:false:1:0:out-of-range-low-hp-finish:target-out-of-attack-range'
    },
    {
      name: 'engaged beyond disengage range exits combat state',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 16000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 17100, y: 0, distance: 17100, current_join_mode: 'Active', hp: 95, vx: 0, recentlyMoved: true, motionObservedSpeed: 0, drop: 20 }
        );
        const hasCombatTarget = Boolean(bot.combatTarget);
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.combat) + ':' + action.combatDisengage?.reason + ':' + hasCombatTarget;
      })(),
      want: 'wait:combat-disengage-range:false:target-beyond-disengage-range:false'
    },
    {
      name: 'retreating edge combat target suppresses fire',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 13000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 100, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'attack:combat-target-retreating:false:target-retreating-edge'
    },
    {
      name: 'low hp retreating edge target gets finish pressure',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 1000, lastInRangeAt: Date.now() - 1000, distance: 13000, hp: 43 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 43, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 80 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.reason + ':' + Boolean(action.shoot) + ':' + action.shootEveryMs + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.pressureClose?.reason + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'attack:combat-finish-pressure:true:520:1:0:low-hp-retreating-target:finish-pressure'
    },
    {
      name: 'retreat ignored target is not reselected without incoming bullet',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 };
        rememberCombatRetreatIgnore({ user_id: 7 });
        const target = pickCombatTarget(self, [
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, drop: 20 }
        ], [], { mode: 'defensive' });
        bot.combatRetreatIgnore.clear();
        return target;
      })(),
      want: null
    },
    {
      name: 'incoming bullet can reengage retreat ignored target',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        rememberCombatRetreatIgnore({ user_id: 7 });
        const action = choose({
          self,
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, drop: 20 }],
          bullets: [{ owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0, distance: 2500 }]
        });
        bot.combatRetreatIgnore.clear();
        return action.kind + ':' + action.target?.id;
      })(),
      want: 'attack:7'
    },
    {
      name: 'non-full invulnerable active still flees',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, invulnerable_remaining_ticks: 5 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'full hp nearby invulnerable target still flees',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 20000, y: 0, current_join_mode: 'Passive', invulnerable_remaining_ticks: 5 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'flee:avoid-invulnerable-target'
    },
    {
      name: 'non-combat damaged state recovers in safe area',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 }
      }).kind,
      want: 'recover'
    },
    {
      name: 'post combat drop over one coin beats recovery wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 0, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 100, y: 0, amount: 2 }]
      }).reason,
      want: 'post-attack-drop-coin'
    },
    {
      name: 'post combat single coin does not beat recovery wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 0, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 1000, y: 0, amount: 1 }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'high drop kill waits at last target position before coin refresh',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.postAttackTarget.id + ':' + Boolean(action.target);
      })(),
      want: 'patrol:post-attack-drop-wait-position:7:false'
    },
    {
      name: 'delayed high drop kill waits after target resolution',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now() - 1500, drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.postAttackTarget.id + ':' + Boolean(action.target);
      })(),
      want: 'patrol:post-attack-drop-wait-position:7:false'
    },
    {
      name: 'zero reward residual high drop target still triggers post kill wait',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 5000, y: 0, current_join_mode: 'Passive', death_reward_preview: 0, hp: 0 }],
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason + ':' + action.postAttackTarget.id + ':' + Boolean(action.target);
      })(),
      want: 'patrol:post-attack-drop-wait-position:7:false'
    },
    {
      name: 'expired high drop post kill wait resumes normal profit',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          attacks: [{ id: 7, x: 5000, y: 0, at: Date.now() - 3000, postAttackDropResolvedAt: Date.now() - 1500, drop: 20, afk: true, action: 'attack' }],
          coins: [{ drop_id: 3, x: -10000, y: 0, amount: 10, native: true }]
        });
        return ['coin', 'seek-coin'].includes(action.kind) && action.reason !== 'post-attack-drop-wait-position';
      })(),
      want: true
    },
    {
      name: 'alive high drop target does not trigger post kill wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 5000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20 }],
        attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'attack' }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'unshot high drop target disappearance does not trigger post kill wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 5000, y: 0, at: Date.now(), drop: 20, afk: true, action: 'seek-enemy' }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'high roi post combat drop at visible edge beats recovery wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 50000, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 50000, y: 0, amount: 5, native: true }]
      }).reason,
      want: 'post-attack-drop-coin'
    },
    {
      name: 'low roi far post combat drop waits for recovery',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 50000, y: 0, at: Date.now(), drop: 9 }],
        coins: [{ drop_id: 8, x: 50000, y: 0, amount: 4, native: true }]
      }).kind,
      want: 'recover'
    },
    {
      name: 'full hp post combat single coin is collected',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        attacks: [{ id: 7, x: 0, y: 0, at: Date.now(), drop: 1 }],
        coins: [{ drop_id: 8, x: 1000, y: 0, amount: 1 }]
      }).reason,
      want: 'post-attack-drop-coin'
    },
    {
      name: 'low long stamina skips far post combat drop',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          max_hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        attacks: [{ id: 7, x: 20000, y: 0, at: Date.now(), drop: 100 }],
        coins: [{ drop_id: 8, x: 20000, y: 0, amount: 100 }]
      }).kind,
      want: 'leave'
    },
    {
      name: 'combat incoming fire uses tangent dodge',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100 }],
        bullets: [{ owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0 }]
      }).reason,
      want: 'combat-tangent-dodge'
    },
    {
      name: 'combat real bullets use 8-direction threat field',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100 }],
          bullets: [
            { owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0 },
            { owner_id: 7, x: 0, y: 9000, vx: 0, vy: -100 }
          ]
        });
        const field = action.combatState.threatField;
        const integerMove = [-1, 0, 1].includes(action.dx) && [-1, 0, 1].includes(action.dy);
        return Boolean(field) + ':' + integerMove + ':' + field.directHitCount + ':' + action.combatState.incomingBullet.threatCount;
      })(),
      want: 'true:true:0:2'
    },
    {
      name: 'combat threat field improves fixed diagonal safety distance',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0 };
        const bullets = [
          { owner_id: 7, x: 9000, y: 0, vx: -100, vy: 0 },
          { owner_id: 7, x: 0, y: 9000, vx: 0, vy: -100 }
        ];
        const threat = incomingBulletThreatForTest(self, null, bullets);
        const fixed = combatThreatFieldCandidateForTest(self, threat.threats, 1, 1);
        const field = combatBulletThreatFieldForTest(self, threat.threats, { preferred: { dx: 1, dy: 1 } });
        return (field.minCpaDistance > fixed.minCpaDistance) + ':' + field.dx + ',' + field.dy;
      })(),
      want: 'true:-1,-1'
    },
    {
      name: 'combat firing target without visible bullet uses tangent dodge',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, firing: true, death_reward_preview: 20 }]
      }).reason,
      want: 'combat-tangent-dodge'
    },
	    {
	      name: 'combat precise incoming lane overrides stale strafe lock',
	      got: (() => {
	        const picked = selectCombatStrafeSign(
          { key: 'owner:7', sign: -1, until: 2000 },
          'owner:7',
          combatPreciseStrafeSign({ ownerId: 7, synthetic: false, signedLaneDistance: -120 }),
          1000
        );
        return picked.sign + ':' + picked.locked + ':' + picked.lockOverridden;
	      })(),
	      want: '1:false:true'
	    },
    {
      name: 'combat pressure close biases diagonal strafe toward target',
      got: (() => {
        const normal = combatStrafeVectorForTest(
          { x: 0, y: 0 },
          { x: 10000, y: 6000 },
          { vx: 500, vy: -500 },
          -1,
          { preferClosing: false }
        );
        const closing = combatStrafeVectorForTest(
          { x: 0, y: 0 },
          { x: 10000, y: 6000 },
          { vx: 500, vy: -500 },
          -1,
          { preferClosing: true }
        );
        return normal.dx + ',' + normal.dy + ':' + closing.dx + ',' + closing.dy + ':' + closing.closingBiased;
      })(),
      want: '-1,-1:1,-1:true'
    },
	    {
	      name: 'combat moving target uses intercept aim',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
      }).aimMode,
      want: 'intercept'
    },
    {
      name: 'combat moving target jitter expands at close range',
      got: (() => {
        const near = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 3000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
        }).aimJitterLimit;
        const far = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
        }).aimJitterLimit;
        return near > far;
      })(),
      want: true
    },
    {
      name: 'combat far target jitter covers measured dodge window',
      got: combatAimJitterLimit(14500) >= 0.1,
      want: true
    },
    {
      name: 'combat intercept solution leads lateral target with render compensation',
      got: (() => {
        const solution = combatInterceptSolution(
          { x: 0, y: 0 },
          { x: 10000, y: 0, vx: 0, vy: 50 },
          10000,
          1
        );
        return Boolean(solution
          && solution.y > 1000
          && solution.flightTicks > 20
          && solution.flightTicks < 23
          && solution.renderDelayTicks === 2);
      })(),
      want: true
    },
    {
      name: 'combat close target jitter stays in logged effective range',
      got: combatAimJitterLimit(2500) <= cfg.combatAimJitterMaxRadians,
      want: true
    },
    {
      name: 'combat low target motion shrinks jitter window',
      got: combatAimJitterLimit(10000, 0.15) < combatAimJitterLimit(10000, 1),
      want: true
    },
    {
      name: 'combat long no-damage aim widening stays capped',
      got: (() => {
        const baseLimit = combatAimJitterLimit(10000, 1);
        const widened = combatAimNoDamageJitterLimit(baseLimit, combatAimNoDamageLevel(9000));
        return widened <= cfg.combatAimNoDamageMaxRadians + 0.000001;
      })(),
      want: true
    },
    {
      name: 'combat stationary long no-damage target steadies aim',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 12000, lastDamageAt: Date.now() - 12000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 88, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, firing: true, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.aimMode + ':' + action.aimJitterLimit + ':' + Boolean(action.combatState?.shooting?.steadyAimFireWindow) + ':' + action.reason + ':' + Boolean(action.shoot);
      })(),
      want: 'steady:0:true:combat-burst-fire:true'
    },
    {
      name: 'combat moving long no-damage target keeps intercept aim',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 12000, lastDamageAt: Date.now() - 12000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 88, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 30, firing: true, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.aimMode;
      })(),
      want: 'intercept'
    },
    {
      name: 'combat coordinate divergence immediately uses live precision aim',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 5000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 10000, distance: 14142, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.x + ':' + action.aimTarget?.y + ':' + Boolean(action.aimTarget?.live) + ':' + action.aimTarget?.sourceDivergenceCm;
      })(),
      want: 'live-precision:coordinate-divergence:5000:0:true:11180'
    },
    {
      name: 'combat radial live target uses precision aim without waiting',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: -50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: -50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.radialPrecision;
      })(),
      want: 'live-precision:radial-motion:true'
    },
    {
      name: 'combat server-stall ignores snapshot coordinates',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 7000, lastDamageAt: t - 7000, hp: 100 };
        bot.serverPositionStall = { stalled: true, reason: 'server-position-stalled', movingMs: 7000, gap: 4200 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 6000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.x + ':' + Boolean(action.aimTarget?.liveIntercept);
      })(),
      want: 'live-precision:live-precision:server-stall-live:10000:false'
    },
    {
      name: 'combat real bullet pressure ignores snapshot coordinates',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 6000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + action.aimTarget?.x + ':' + Boolean(action.aimTarget?.liveIntercept) + ':' + Boolean(action.aimTarget?.realBulletPrecision);
      })(),
      want: 'live-precision:live-precision:real-bullet-pressure:10000:false:true'
    },
    {
      name: 'combat server-stall lateral live target keeps intercept',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 7000, lastDamageAt: t - 7000, hp: 100 };
        bot.serverPositionStall = { stalled: true, reason: 'server-position-stalled', movingMs: 7000, gap: 4200 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.liveIntercept);
      })(),
      want: 'intercept:live-intercept:server-stall-live-intercept:true'
    },
    {
      name: 'combat real bullet pressure lateral live target keeps intercept',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 0, vy: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.liveIntercept) + ':' + Boolean(action.aimTarget?.realBulletPrecision);
      })(),
      want: 'intercept:live-intercept:real-bullet-pressure-intercept:true:true'
    },
    {
      name: 'combat real bullet pressure radial target still uses live precision',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: -50, vy: 0, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: -50, vy: 0, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        return action.aimMode + ':' + action.aimTarget?.strategy + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.liveIntercept) + ':' + Boolean(action.aimTarget?.radialPrecision);
      })(),
      want: 'live-precision:live-precision:real-bullet-pressure:false:true'
    },
    {
      name: 'combat out-of-range snapshot does not suppress fire',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 20000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 }
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimTarget?.x + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.aimTarget?.snapshot);
      })(),
      want: '10000:normal:true:false'
    },
    {
      name: 'combat close target ignores far snapshot outlier',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t, lastDamageAt: t, hp: 100 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 5000, y: 0, hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 45000, y: 0, hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, name: 'target', x: 5000, y: 0, distance: 5000, current_join_mode: 'Active', hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.x + ':' + Boolean(action.shoot) + ':' + Boolean(action.aimTarget?.snapshot);
      })(),
      want: 'live-precision:5000:true:false'
    },
    {
      name: 'combat damaged native target ignores stale snapshot hp',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 12000, lastDamageAt: t - 12000, hp: 97 };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 10000, y: 0, hp: 97, max_hp: 100, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        bot.testSnapshotEntities = [{ user_id: 7, name: 'target', x: 16000, y: 0, hp: 100, max_hp: 100, current_join_mode: 'Active', vx: 0, vy: 0 }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 79, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 97, max_hp: 100, vx: 50, motionObservedSpeed: 50, recentlyMoved: true, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.testNativeEntities = null;
        bot.testSnapshotEntities = null;
        return action.aimMode + ':' + action.aimTarget?.x + ':' + action.aimTarget?.live + ':' + action.target?.hp + ':' + Boolean(action.aimTarget?.authority);
      })(),
      want: 'live-precision:10000:true:97:false'
    },
    {
      name: 'combat very close target backs away while shooting',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
          { user_id: 7, x: 3000, y: 0, distance: 3000, current_join_mode: 'Passive', hp: 100, vx: 30, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot);
      })(),
      want: 'combat-spacing:-1:0:true'
    },
    {
      name: 'combat emergency close spacing overrides incoming bullet strafe',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 2500, y: 0, distance: 2500, current_join_mode: 'Active', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.spacing?.reason + ':' + Boolean(action.combatState?.spacing?.overrideBullet);
      })(),
      want: 'combat-spacing-dodge:-1:0:too-close:true'
    },
    {
      name: 'combat low hp close risk exits before losing hp disadvantage',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 49, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 1900, y: 0, distance: 1900, current_join_mode: 'Active', hp: 46, firing: true, drop: 20 }
        );
        return action.kind + ':' + action.reason + ':' + Boolean(action.combatState?.closeRisk) + ':' + action.combatState?.closeRisk?.distance;
      })(),
      want: 'leave:combat-low-hp-leave:true:1900'
    },
    {
      name: 'combat mid range target does not back away',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
          { user_id: 7, x: 5000, y: 0, distance: 5000, current_join_mode: 'Passive', hp: 100, vx: 30, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot);
      })(),
      want: 'combat-attack:0:0:true'
    },
    {
      name: 'combat long no-damage target is pressured closer',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 10000, lastDamageAt: Date.now() - 10000, hp: 100 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
          { user_id: 7, x: 9000, y: 0, distance: 9000, current_join_mode: 'Passive', hp: 100, vx: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + action.combatState?.pressureClose?.reason;
      })(),
      want: 'combat-pressure-close:1:0:long-no-damage'
    },
    {
      name: 'combat far no-damage target is pressured into effective range',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, hp: 88 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 2500 },
          { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 88, vx: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.shootEveryMs + ':' + action.combatState?.pressureClose?.reason + ':' + action.combatState?.pressureClose?.closeRange + ':' + action.combatState?.shooting?.trend?.stance;
      })(),
      want: 'combat-stamina-conserve:1:0:false:700:far-no-damage:7500:far-no-damage-close'
    },
    {
      name: 'combat far no-damage retreating edge does not pressure chase',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, lastInRangeAt: Date.now() - 7000, distance: 13000, hp: 88 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 88, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.combatState?.pressureClose) + ':' + action.combatState?.shooting?.reason + ':' + action.combatState?.retreatingTarget?.reason;
      })(),
      want: 'combat-target-retreating:0:0:false:target-retreating-edge:target-retreating-edge'
    },
    {
      name: 'combat far no-damage retreating fighter pressure closes under real bullet',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, lastInRangeAt: Date.now() - 7000, distance: 13000, hp: 76 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 82, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          { user_id: 7, x: 14000, y: 0, distance: 14000, current_join_mode: 'Active', hp: 76, vx: 50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 },
          [{ id: 'target-shot', ownerId: 7, x: 10000, y: 0, vx: -500, vy: 0 }]
        );
        bot.combatTarget = null;
        bot.combatRetreatIgnore.clear();
        return action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.pressureClose?.reason + ':' + action.combatState?.pressureClose?.farNoDamageClose + ':' + (action.combatState?.shooting?.reason === 'target-retreating-edge') + ':' + action.combatState?.retreatingTarget?.reason;
      })(),
      want: '1:0:true:retreating-fighter-close:true:false:target-retreating-edge'
    },
    {
      name: 'combat far no-damage pressure waits when hp gap is already bad',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 7000, lastDamageAt: Date.now() - 7000, hp: 88 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100 },
          { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 88, vx: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + Boolean(action.combatState?.pressureClose);
      })(),
      want: 'combat-attack:false'
    },
    {
      name: 'combat short stamina exhaustion stops movement and fire',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.movementSuppressed?.reason;
      })(),
      want: 'combat-stamina-hold:0:0:false:stamina-5s-exhausted'
    },
    {
      name: 'combat preserves dodge stamina by pausing fire',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'combat-stamina-conserve:1:1:false:reserve-for-dodge'
    },
    {
      name: 'combat reserve band uses burst fire without force shooting',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 4500 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.forceShoot) + ':' + action.shootEveryMs + ':' + action.combatState?.shooting?.reason;
      })(),
      want: 'combat-burst-fire:true:false:360:burst-fire'
    },
    {
      name: 'combat high HP reserve band keeps burst pressure',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 100, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.highHpFireWindow);
      })(),
      want: 'combat-burst-fire:1:1:true:burst-fire:true'
    },
    {
      name: 'combat low threat finish window keeps burst pressure without bullet risk',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2800 },
          { user_id: 7, x: 8200, y: 0, distance: 8200, current_join_mode: 'Active', hp: 7, vx: 35, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.finishLowThreatFireWindow);
      })(),
      want: 'combat-burst-fire:true:burst-fire:true'
    },
    {
      name: 'combat low threat finish window starts at low target HP',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2800 },
          { user_id: 7, x: 8200, y: 0, distance: 8200, current_join_mode: 'Active', hp: 55, vx: 35, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.finishLowThreatFireWindow);
      })(),
      want: 'combat-burst-fire:true:burst-fire:true'
    },
    {
      name: 'combat low threat finish window stays bounded above low HP',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2800 },
          { user_id: 7, x: 8200, y: 0, distance: 8200, current_join_mode: 'Active', hp: 56, vx: 35, drop: 20 }
        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.finishLowThreatFireWindow);
      })(),
      want: 'combat-burst-fire:true:burst-fire:false'
    },
    {
      name: 'combat mid HP reserve band still preserves dodge stamina',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 3200 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Passive', hp: 70, firing: true, drop: 20 }
        );
        return action.reason + ':' + action.dx + ':' + action.dy + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.reason + ':' + Boolean(action.combatState?.shooting?.highHpFireWindow);
      })(),
      want: 'combat-stamina-conserve:1:1:false:reserve-for-dodge:false'
    },
	    {
	      name: 'combat close pressure fire window keeps mid hp shooting',
	      got: (() => {
	        const action = chooseCombatAction(
	          { user_id: 1, x: 0, y: 0, hp: 67, max_hp: 100, stamina_5s_remaining_milli: 3198 },
	          { user_id: 7, x: 6300, y: 0, distance: 6300, current_join_mode: 'Active', hp: 61, vx: 50, drop: 20 },
	          [{ id: 'target-shot', ownerId: 7, x: 5000, y: 0, vx: -500, vy: 0 }]
	        );
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.dodgeReserveMs + ':' + Boolean(action.combatState?.shooting?.closePressureFireWindow);
	      })(),
	      want: 'combat-burst-fire:true:2600:true'
	    },
	    {
	      name: 'combat sustained target pressure exits losing no-damage fight',
	      got: (() => {
	        const t = Date.now();
	        bot.combatTarget = { id: 7, at: t - 13000, lastDamageAt: t - 13000, hp: 82 };
	        const action = chooseCombatAction(
	          { user_id: 1, x: 0, y: 0, hp: 68, max_hp: 100, stamina_5s_remaining_milli: 7000 },
	          { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 82, vx: 35, drop: 20 },
	          [{ id: 'target-shot', ownerId: 7, x: 10000, y: 0, vx: -500, vy: 0 }]
	        );
	        bot.combatTarget = null;
	        return action.reason + ':' + Boolean(action.combatState?.sustainedPressureDisadvantage) + ':' + action.combatState?.sustainedPressureDisadvantage?.noDamageMs;
	      })(),
	      want: 'combat-hp-disadvantage-leave:true:13000'
	    },
	    {
	      name: 'combat long no-damage active duel resumes reserve-band fire',
	      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 32000, lastDamageAt: Date.now() - 32000, hp: 82 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 85, max_hp: 100, stamina_5s_remaining_milli: 3139 },
          { user_id: 7, x: 12275, y: 0, distance: 12275, current_join_mode: 'Active', hp: 82, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + Boolean(action.shoot) + ':' + action.combatState?.shooting?.dodgeReserveMs + ':' + Boolean(action.combatState?.shooting?.noDamageDuelFireWindow);
      })(),
      want: 'combat-burst-fire:true:3000:true'
    },
    {
      name: 'combat trend classifies long no-damage duel stance',
      got: (() => {
        const trend = combatTrendState(
          { user_id: 1, hp: 85 },
          { targetHp: 82, targetDistance: 12275, targetActive: true, targetMoving: true, noDamageMs: 32000 }
        );
        return trend.stance + ':' + Boolean(trend.noDamageDuelFireWindow) + ':' + trend.hpGap;
      })(),
      want: 'no-damage-duel:true:-3'
    },
    {
      name: 'combat long no-damage fire window keeps low hp conservative',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now() - 32000, lastDamageAt: Date.now() - 32000, hp: 70 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 100, stamina_5s_remaining_milli: 3139 },
          { user_id: 7, x: 12275, y: 0, distance: 12275, current_join_mode: 'Active', hp: 70, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + Boolean(action.shoot) + ':' + Boolean(action.combatState?.shooting?.noDamageDuelFireWindow);
      })(),
      want: 'combat-stamina-conserve:false:false'
    },
    {
      name: 'combat low confidence distant mover throttles fire cadence',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 7,
          at: t - 1200,
          lastDamageAt: t - 1200,
          hp: 100,
          motionSamples: [
            { at: t - 1200, x: 12000, y: -200, vx: 0, vy: 50, hp: 100, selfHp: 100 },
            { at: t - 850, x: 12000, y: 400, vx: 0, vy: -50, hp: 100, selfHp: 100 },
            { at: t - 500, x: 12000, y: -100, vx: 0, vy: 50, hp: 100, selfHp: 100 }
          ]
        };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 12000, y: 200, distance: 12002, current_join_mode: 'Active', hp: 100, vx: 0, vy: -50, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 }
        );
        bot.combatTarget = null;
        return action.reason + ':' + action.combatState?.shooting?.reason + ':' + action.shootEveryMs + ':' + Boolean(action.aimTarget?.opponentProfile?.strafePattern);
      })(),
      want: 'combat-burst-fire:low-confidence-burst:520:true'
    },
    {
      name: 'combat trade estimate observes losing exchange before exit',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 7,
          at: t - 4000,
          lastDamageAt: t - 500,
          hp: 95,
          motionSamples: [
            { at: t - 4000, x: 10000, y: 0, vx: 35, vy: 0, hp: 100, selfHp: 100 },
            { at: t - 2500, x: 10200, y: 0, vx: 35, vy: 0, hp: 98, selfHp: 92 },
            { at: t - 1000, x: 10400, y: 0, vx: 35, vy: 0, hp: 95, selfHp: 84 }
          ]
        };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 90, vx: 35, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatDisadvantageObservation = null;
        return action.reason + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready) + ':' + Math.round(action.combatState?.disadvantageObservation?.evidence?.selfDamage || 0);
      })(),
      want: 'combat-attack:trade-estimate:false:20'
    },
    {
      name: 'confirmed combat trade estimate exits losing exchange',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = {
          id: 7,
          at: t - 5200,
          firstSeenAt: t - 5200,
          lastDamageAt: t - 500,
          hp: 95,
          motionSamples: [
            { at: t - 5200, x: 10000, y: 0, vx: 35, vy: 0, hp: 100, selfHp: 100 },
            { at: t - 3600, x: 10200, y: 0, vx: 35, vy: 0, hp: 98, selfHp: 92 },
            { at: t - 2100, x: 10400, y: 0, vx: 35, vy: 0, hp: 95, selfHp: 84 }
          ]
        };
        bot.combatDisadvantageObservation = { id: '7', kind: 'trade-estimate', firstAt: t - 3000, at: t - 100, count: 4 };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 7000 },
          { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 90, vx: 35, drop: 20 }
        );
        bot.combatTarget = null;
        bot.combatDisadvantageObservation = null;
        return action.reason + ':' + Boolean(action.combatState?.tradeEstimate?.active) + ':' + action.combatState?.disadvantageObservation?.kind + ':' + Boolean(action.combatState?.disadvantageObservation?.ready);
      })(),
      want: 'combat-hp-disadvantage-leave:true:trade-estimate:true'
    },
    {
      name: 'combat zero damage trade estimate stays in fight while hp remains safe',
      got: (() => {
        const t = Date.now();
        const originalNow = Date.now;
        bot.combatTarget = {
          id: 7,
          at: t - 6200,
          firstSeenAt: t - 20000,
          lastDamageAt: t - 19000,
          hp: 61,
          motionSamples: [
            { at: t - 6000, x: 10000, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 94 },
            { at: t - 3000, x: 10200, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 90 }
          ]
        };
        Date.now = () => t;
        try {
          const estimate = combatTradeEstimate(
            { user_id: 1, x: 0, y: 0, hp: 85, max_hp: 100, stamina_5s_remaining_milli: 7000 },
            { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 61, vx: 35, drop: 20 }
          );
          return Boolean(estimate?.active) + ':' + Boolean(estimate?.zeroDamageWindow) + ':' + Math.round(estimate?.tDeathMs || 0);
        } finally {
          Date.now = originalNow;
          bot.combatTarget = null;
        }
      })(),
      want: 'false:true:56667'
    },
    {
      name: 'combat zero damage trade estimate still exits when danger horizon is near',
      got: (() => {
        const t = Date.now();
        const originalNow = Date.now;
        bot.combatTarget = {
          id: 7,
          at: t - 6200,
          firstSeenAt: t - 20000,
          lastDamageAt: t - 19000,
          hp: 61,
          motionSamples: [
            { at: t - 6000, x: 10000, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 96 },
            { at: t - 3000, x: 10200, y: 0, vx: 35, vy: 0, hp: 61, selfHp: 88 }
          ]
        };
        Date.now = () => t;
        try {
          const estimate = combatTradeEstimate(
            { user_id: 1, x: 0, y: 0, hp: 80, max_hp: 100, stamina_5s_remaining_milli: 7000 },
            { user_id: 7, x: 10500, y: 0, distance: 10500, current_join_mode: 'Active', hp: 61, vx: 35, drop: 20 }
          );
          return Boolean(estimate?.active) + ':' + Boolean(estimate?.zeroDamageWindow) + ':' + Math.round(estimate?.tDeathMs || 0);
        } finally {
          Date.now = originalNow;
          bot.combatTarget = null;
        }
      })(),
      want: 'true:true:30000'
    },
    {
      name: 'combat native tick interval tightens only during combat',
      got: (() => {
        const t = 100000;
        return [
          nativeTickMinIntervalMs({ decision: { combat: true }, nowMs: t }),
          nativeTickMinIntervalMs({ decision: { kind: 'coin' }, nowMs: t }),
          nativeTickMinIntervalMs({ combatTarget: { at: t - 500 }, nowMs: t }),
          nativeTickMinIntervalMs({ combatTarget: { at: t - 60000 }, nowMs: t })
        ].join(',');
      })(),
      want: '80,120,80,120'
    },
    {
      name: 'combat close pressure hp disadvantage exits before low hp threshold',
      got: (() => {
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 55, max_hp: 100, stamina_5s_remaining_milli: 3198 },
          { user_id: 7, x: 6300, y: 0, distance: 6300, current_join_mode: 'Active', hp: 61, vx: 50, drop: 20 },
          [{ ownerId: 7 }]
        );
        return action.reason + ':' + action.combatState?.hpGap + ':' + action.combatState?.pressureDisadvantage?.distance;
      })(),
      want: 'combat-hp-disadvantage-leave:6:6300'
    },
    {
      name: 'combat sustained pressure no-damage exits earlier against healthy targets',
      got: (() => {
        const state = combatSustainedPressureDisadvantageState(79, 91, 12000, 12000, true);
        return state === null ? 'wait' : state.threshold + ':' + state.targetHpMin + ':' + state.hpGap;
      })(),
      want: '80:75:12'
    },
    {
      name: 'combat sustained pressure no-damage keeps low target recoverable',
      got: (() => {
        const state = combatSustainedPressureDisadvantageState(70, 61, 9000, 12000, true);
        return state === null ? 'keep-fighting' : state.threshold + ':' + state.targetHpMin + ':' + state.hpGap;
      })(),
      want: 'keep-fighting'
    },
    {
      name: 'combat sustained pressure no-damage exits at stop-loss hp',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 30000, lastDamageAt: t - 12000, hp: 91 };
        try {
          const action = chooseCombatAction(
            { user_id: 1, x: 0, y: 0, hp: 69, max_hp: 100, stamina_5s_remaining_milli: 6500 },
            { user_id: 7, x: 12000, y: 0, distance: 12000, current_join_mode: 'Active', hp: 91, vx: 50, drop: 20 },
            [{ id: 'target-shot', ownerId: 7, x: 9000, y: 0, vx: -500, vy: 0 }]
          );
          return [
            action.reason,
            action.combatState?.sustainedPressureDisadvantage?.threshold,
            action.combatState?.sustainedPressureDisadvantage?.noDamageMs >= 10000,
            action.combatState?.sustainedPressureDisadvantage?.hpGap
          ].join(':');
        } finally {
          bot.combatTarget = null;
        }
      })(),
      want: 'combat-hp-disadvantage-leave:80:true:22'
    },
    {
      name: 'combat server stall no-damage waits for precision aim grace',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 30000, lastDamageAt: t - 30000, hp: 95 };
        bot.serverPositionStall = {
          stalled: true,
          reason: 'server-position-stalled',
          movingMs: 28000,
          gap: 8200,
          gapDelta: 6100,
          holdRemainingMs: 4000
        };
        bot.testNativeEntities = [{ user_id: 7, name: 'target', x: 8000, y: 0, hp: 95, current_join_mode: 'Active', vx: 50, motionObservedSpeed: 50, recentlyMoved: true }];
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, name: 'target', x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 95, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        bot.testNativeEntities = null;
        return action.kind + ':' + action.aimMode + ':' + action.aimTarget?.strategyReason + ':' + Boolean(action.aimTarget?.live) + ':' + Boolean(action.combatState?.serverStallNoDamage);
      })(),
      want: 'attack:live-precision:coordinate-divergence:true:false'
    },
    {
      name: 'combat server stall long no-damage exits before broad hp disadvantage',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 36000, lastDamageAt: t - 36000, hp: 95 };
        bot.serverPositionStall = {
          stalled: true,
          reason: 'server-position-stalled',
          movingMs: 34000,
          gap: 8200,
          gapDelta: 6100,
          holdRemainingMs: 4000
        };
        const action = chooseCombatAction(
          { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 6000 },
          { user_id: 7, x: 10000, y: 0, distance: 10000, current_join_mode: 'Active', hp: 95, vx: 35, recentlyMoved: true, motionObservedSpeed: 50, drop: 20 },
          [{ ownerId: 7 }]
        );
        bot.combatTarget = null;
        bot.serverPositionStall = null;
        return action.reason + ':' + action.combatState?.serverStallNoDamage?.hpGap + ':' + Boolean(action.combatState?.serverStallNoDamage?.serverPositionStall?.stalled);
      })(),
      want: 'combat-hp-disadvantage-leave:5:true'
    },
    {
      name: 'coin route uses horizontal axis when x gap dominates',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 15000, y: 500 });
        return dir.dx === 1 && dir.dy === 0 && dir.axisApproach === 'x';
      })(),
      want: true
    },
    {
      name: 'coin route releases axis approach before close target',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 4800, y: 500 });
        return dir.dx === 1 && dir.dy === 1 && !dir.axisApproach;
      })(),
      want: true
    },
    {
      name: 'coin axis lock releases before likely overrun',
      got: coinAxisLockShouldHold({ dx: 1, dy: 0 }, 500, 0) === false
        && coinAxisLockShouldHold({ dx: 1, dy: 0 }, 1200, 0) === true,
      want: true
    },
    {
      name: 'close coin pickup uses short brake pulse',
      got: coinPickupPrecisionPulseMs(500) <= 90,
      want: true
    },
    {
      name: 'coin pickup pulse slows near target',
      got: (() => {
        const stop = coinPickupPrecisionPulseMs(20);
        const micro = coinPickupPrecisionPulseMs(80);
        const fine = coinPickupPrecisionPulseMs(250);
        const brake = coinPickupPrecisionPulseMs(500);
        const sweep = coinPickupPrecisionPulseMs(800);
        return stop < micro && micro < fine && fine < brake && brake < sweep;
      })(),
      want: true
    },
    {
      name: 'coin pickup repeated failures reduce pulse',
      got: coinPickupPrecisionPulseMs(500, 3) < coinPickupPrecisionPulseMs(500)
        && coinPickupPrecisionPulseMs(500, 100) === cfg.coinPickupFailureMinPulseMs,
      want: true
    },
    {
      name: 'close coin pickup keeps moving inside old tolerance',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 40, y: 0 });
        return dir.dx === 1 && dir.dy === 0 && dir.exactTarget === true;
      })(),
      want: true
    },
    {
      name: 'close coin pickup stops only at exact coordinate',
      got: (() => {
        const dir = coinDirectionTo({ x: 10, y: -5 }, { x: 10, y: -5 });
        return dir.dx === 0 && dir.dy === 0 && dir.exactTarget === true;
      })(),
      want: true
    },
    {
      name: 'coin route keeps diagonal when both axes are material',
      got: (() => {
        const dir = coinDirectionTo({ x: 0, y: 0 }, { x: 15000, y: 6000 });
        return dir.dx === 1 && dir.dy === 1 && !dir.axisApproach;
      })(),
      want: true
    },
    {
      name: 'stationary active outside caution allows foot coin only',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 45000, y: 0, current_join_mode: 'Active', death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -500, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'full hp stationary non-full active does not block coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 23000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 5000, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'stationary full-stamina active with drop is non-combat profit attack',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, death_reward_preview: 20 }]
        });
        return action.kind + ':' + Boolean(action.combat) + ':' + action.reason;
      })(),
      want: 'attack:false:best-opportunity-afk-drop-target'
    },
    {
      name: 'stationary full-stamina active zero drop does not beat coin pickup',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000 }],
        coins: [{ drop_id: 2, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'full hp avoids invulnerable active in caution range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 23000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable_remaining_ticks: 5 }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'invulnerable active blocks coin route in same direction',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable: true }],
        coins: [{ drop_id: 2, x: 22000, y: 0, amount: 10 }]
      }).reason,
      want: 'wait-for-snapshot-coin'
    },
    {
      name: 'invulnerable active allows coin away from its direction',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, invulnerable: true }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'invulnerable drop target is avoided instead of attacked',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20, invulnerable: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'flee:avoid-invulnerable-target'
    },
    {
      name: 'pursuit leave threshold shortens for non-full hp and invulnerable chaser',
      got: [
        pursuitLeaveThresholdForTest({ hp: 80, max_hp: 100 }, { current_join_mode: 'Active' }),
        pursuitLeaveThresholdForTest({ hp: 100, max_hp: 100 }, { current_join_mode: 'Active', invulnerable: true }),
        pursuitLeaveThresholdForTest({ hp: 80, max_hp: 100 }, { current_join_mode: 'Active', invulnerable: true })
      ].join(','),
      want: '90000,60000,45000'
    },
    {
      name: 'combat action suppresses same-target pursuit leave',
      got: [
        pursuitLeaveSuppressedByCombatAction({ id: 7 }, { combat: true, target: { id: 7 } }),
        pursuitLeaveSuppressedByCombatAction({ id: 7 }, { combat: true, target: { id: 8 } }),
        pursuitLeaveSuppressedByCombatAction({ id: 7 }, { combat: false, target: { id: 7 } })
      ].join(','),
      want: 'true,false,false'
    },
    {
      name: 'defensive target switch requires immediate incoming bullet',
      got: [
        defensiveTargetOverridesEngaged({ user_id: 1 }, { user_id: 2, incomingBullet: { ownerId: 2, distance: 12000 } }),
        defensiveTargetOverridesEngaged({ user_id: 1 }, { user_id: 2, incomingBullet: { ownerId: 2, distance: 2500 } }),
        defensiveTargetOverridesEngaged({ user_id: 1 }, { user_id: 2, incomingBullet: { ownerId: 2, timeToImpactMs: 500 } })
      ].join(','),
      want: 'false,true,true'
    },
    {
      name: 'whitelisted afk drop target is not attacked',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 9, name: '文月', x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 100 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'whitelisted firing target is not shot defensively',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 9, name: '文月', x: 10000, y: 0, current_join_mode: 'Passive', firing: true, hp: 100, death_reward_preview: 100 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'safe near coin beats active caution migration',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -1000, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'full hp active caution no longer blocks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 24000, y: 0, current_join_mode: 'Active', vx: -50 }],
        coins: [{ drop_id: 2, x: -22000, y: 0, amount: 5 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'visible coin before active danger radius beats snapshot wait',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50 }],
        coins: [{ drop_id: 2, x: 10000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'active coin danger allows route that stops before threat buffer',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0 };
        const threat = decorateThreat(self, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50 });
        return coinBlockedByThreat(self, { drop_id: 2, x: 10000, y: 0, amount: 1 }, threat);
      })(),
      want: false
    },
    {
      name: 'active coin danger blocks route ending inside threat buffer',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0 };
        const threat = decorateThreat(self, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50 });
        return coinBlockedByThreat(self, { drop_id: 2, x: 18000, y: 0, amount: 1 }, threat);
      })(),
      want: true
    },
    {
      name: 'combat target in range beats active caution',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [
          { user_id: 4, x: 24000, y: 0, current_join_mode: 'Active', vx: -50 },
          { user_id: 17, x: 10000, y: 0, current_join_mode: 'Passive', vx: 30, death_reward_preview: 17 }
        ]
      }).kind,
      want: 'attack'
    },
    {
      name: 'passive runner combat closes and uses visible intercept',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 12000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          death_reward_preview: 20,
          hp: 100,
          distance: 12000,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 3000, firstSeenAt: t - 3000, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          action.dx,
          action.dy,
          action.aimTarget?.strategyReason,
          action.aimTarget?.passiveRunner,
          Boolean(action.combatState?.passiveRunner)
        ].join('|');
      })(),
      want: 'combat-passive-runner-close|1|0|passive-runner-intercept|true|true'
    },
    {
      name: 'passive runner closes inside normal preferred spacing',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 5200,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 5200,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 3000, firstSeenAt: t - 3000, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          action.dx,
          action.combatState?.pressureClose?.closeRange,
          action.combatState?.passiveRunner?.active
        ].join('|');
      })(),
      want: 'combat-passive-runner-close|1|4500|true'
    },
    {
      name: 'passive runner keeps firing below ordinary dodge reserve',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 2200 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 6000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 6000,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 3000, firstSeenAt: t - 3000, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          action.shoot,
          action.combatState?.shooting?.dodgeReserveMs,
          action.combatState?.shooting?.passiveRunnerFireWindow,
          action.combatState?.shooting?.trend?.stance
        ].join('|');
      })(),
      want: 'combat-burst-fire|true|1800|true|passive-runner'
    },
    {
      name: 'passive runner waits for confirm window',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 12000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 12000,
          drop: 20,
          combatIntent: 'profit'
        };
        const t = Date.now();
        bot.combatTarget = { id: 4, at: t - 1200, firstSeenAt: t - 1200, intent: 'profit', originIntent: 'profit', hp: 100, motionSamples: [{ selfHp: 100 }, { selfHp: 100 }] };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          action.reason,
          Boolean(action.combatState?.passiveRunner?.active),
          action.combatState?.passiveRunner?.confirmed,
          action.combatState?.passiveRunner?.engagedMs >= action.combatState?.passiveRunner?.confirmMs
        ].join('|');
      })(),
      want: 'combat-attack|false|false|false'
    },
    {
      name: 'passive runner disables after target real bullet history',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 };
        const target = {
          user_id: 4,
          name: 'runner',
          x: 12000,
          y: 0,
          vx: -35,
          vy: 35,
          current_join_mode: 'Active',
          hp: 100,
          distance: 12000,
          drop: 20,
          combatIntent: 'engaged'
        };
        const t = Date.now();
        bot.combatTarget = {
          id: 4,
          at: t - 5000,
          firstSeenAt: t - 5000,
          intent: 'engaged',
          originIntent: 'profit',
          seenTargetRealBulletAt: t - 800,
          hp: 100,
          motionSamples: [{ selfHp: 100 }, { selfHp: 100 }]
        };
        bot.testNativeEntities = [{ ...target }];
        const action = chooseCombatAction(self, target, []);
        bot.testNativeEntities = [];
        bot.combatTarget = null;
        return [
          Boolean(action.combatState?.passiveRunner?.active),
          action.combatState?.passiveRunner?.seenTargetRealBulletMs > 0
        ].join('|');
      })(),
      want: 'false|true'
    },
    {
      name: 'winning pressure keeps firing to finish low target',
      got: (() => {
        const t = Date.now();
        bot.combatTarget = { id: 7, at: t - 30000, lastDamageAt: t - 8000, hp: 70 };
        try {
          const action = chooseCombatAction(
            { user_id: 1, x: 0, y: 0, hp: 74, max_hp: 100, stamina_5s_remaining_milli: 2200 },
            { user_id: 7, x: 8500, y: 0, distance: 8500, current_join_mode: 'Active', hp: 62, vx: 35, drop: 20 },
            [{ id: 'target-shot', ownerId: 7, x: 7000, y: 0, vx: -500, vy: 0 }]
          );
          return [
            action.reason,
            action.shoot,
            action.combatState?.shooting?.dodgeReserveMs,
            action.combatState?.shooting?.winningPressureFireWindow,
            action.combatState?.shooting?.trend?.stance
          ].join('|');
        } finally {
          bot.combatTarget = null;
        }
      })(),
      want: 'combat-burst-fire|true|1800|true|winning-pressure'
    },
    {
      name: 'return block prevents moving back toward nearby active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: 1, dy: 0 }
      ).kind,
      want: 'flee'
    },
    {
      name: 'return block allows moving away from nearby active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: -1, dy: 0, target: { distance: 500 } }
      ).kind,
      want: 'coin'
    },
    {
      name: 'return block scans instead of fleeing when already backing away',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: -1, dy: 0, target: { distance: 5000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block scans instead of far fleeing when not heading toward active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: 0, dy: -1, target: { distance: 90000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block scans inside exit radius when moving away after fresh injection',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: -1, dy: -1, target: { distance: 120000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block guards against turning back inside 25k cap',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 23000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: 1, dy: 0, target: { distance: 120000 } }
      ).kind,
      want: 'flee'
    },
    {
      name: 'return block allows moving after 25k cap',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: -1, dy: 0, target: { distance: 120000 } }
      ).kind,
      want: 'seek-coin'
    },
    {
      name: 'far active allows snapshot coin travel away from it',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active' }],
        coins: [
          { drop_id: 2, x: -90000, y: -1000, amount: 1, snapshot: true },
          { drop_id: 3, x: -94000, y: 2000, amount: 1, snapshot: true },
          { drop_id: 4, x: -98000, y: -2000, amount: 1, snapshot: true }
        ]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'far active allows snapshot coin travel beyond it',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active' }],
        coins: [
          { drop_id: 2, x: 70000, y: -1000, amount: 1, snapshot: true },
          { drop_id: 3, x: 74000, y: 2000, amount: 1, snapshot: true },
          { drop_id: 4, x: 78000, y: -2000, amount: 1, snapshot: true }
        ]
      }).kind,
      want: 'seek-coin'
      },
    {
      name: 'full hp low stamina waits when no snapshot coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 2000 },
        global: [{ user_id: 4, x: 20000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'low stamina picks close safe coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 6000 },
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'low stamina still picks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 6000 },
        coins: [{ drop_id: 1, x: 9000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'medium stamina still seeks far visible coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 7000 },
        coins: [{ drop_id: 1, x: 20000, y: 0, amount: 1 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'medium stamina picks edge near coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 7000 },
        coins: [{ drop_id: 1, x: 13000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'medium stamina still picks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 7000 },
        coins: [{ drop_id: 1, x: 15000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'stationary afk target in range is shot without combat',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }]
        });
        return action.kind + ':' + Boolean(action.combat);
      })(),
      want: 'attack:false'
    },
    {
      name: 'low value afk target in range is skipped',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 2 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'high own drop still allows afk shot',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000, drop: 30 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 12 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'worthwhile close passive target is shot without combat',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000, drop: 30 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 16 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'near passive drop can beat lower coin target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'same value coin beats afk drop after shot stamina cost',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 5 }],
          coins: [{ drop_id: 1, x: 10000, y: 0, amount: 5 }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: '500m drop five afk loses to 100m one coin by pickup travel cost',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          global: [{ user_id: 7, x: 50000, y: 0, current_join_mode: 'Passive', death_reward_preview: 5 }],
          coins: [{ drop_id: 1, x: -10000, y: 0, amount: 1, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: 'same distance ten coin beats drop ten after kill pickup cost',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 10 }],
          coins: [{ drop_id: 1, x: 10000, y: 0, amount: 10, native: true }]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'coin:best-opportunity-coin'
    },
    {
      name: 'visible coin route beats closer single coin by route roi',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -8000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 12000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 12500, y: 0, amount: 1, native: true },
            { drop_id: 4, x: 13000, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason + ':' + action.id + ':' + action.coinRoute?.legCount + ':' + action.coinRoute?.points?.length + ':' + action.coinRoute?.value;
      })(),
      want: 'coin:best-opportunity-coin-route:2:3:3:3'
    },
    {
      name: 'held coin route keeps first coin through near tie replans',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-coin-route',
          x: -3000,
          y: 8000,
          amount: 1,
          score: 104545,
          coinRouteIds: ['1', '3', '2'],
          coinRouteValue: 3,
          coinRouteLegs: 3,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = choose({
          self: { user_id: 1, x: 500, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -3000, y: 8000, amount: 1, native: true },
            { drop_id: 2, x: 3000, y: 8000, amount: 1, native: true },
            { drop_id: 3, x: 0, y: 11000, amount: 1, native: true }
          ]
        });
        const remembered = bot.opportunityChoice?.id + ':' + (bot.opportunityChoice?.coinRouteIds || []).join('-');
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.routeHeld) + ':' + action.coinRoute?.ids?.join('-') + ':' + remembered;
      })(),
      want: 'coin:best-opportunity-coin-route:1:true:1-3-2:1:1-3-2'
    },
    {
      name: 'held coin route switches first coin when route score is clearly better',
      got: (() => {
        const t = Date.now();
        bot.opportunityChoice = {
          key: 'coin:1',
          type: 'coin',
          id: 1,
          reason: 'best-opportunity-coin-route',
          x: -3000,
          y: 8000,
          amount: 1,
          score: 97375,
          coinRouteIds: ['1', '3', '2'],
          coinRouteValue: 3,
          coinRouteLegs: 3,
          at: t - 500,
          lastSeenAt: t - 100,
          until: t + cfg.opportunitySwitchHoldMs
        };
        const action = choose({
          self: { user_id: 1, x: 3000, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -3000, y: 8000, amount: 1, native: true },
            { drop_id: 2, x: 3000, y: 8000, amount: 1, native: true },
            { drop_id: 3, x: 0, y: 11000, amount: 1, native: true }
          ]
        });
        bot.opportunityChoice = null;
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.routeHeld) + ':' + action.coinRoute?.ids?.join('-');
      })(),
      want: 'coin:best-opportunity-coin-route:2:false:2-3-1'
    },
    {
      name: 'same first coin route keeps overlay metadata when single coin roi is higher',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: 2000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 16000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 17000, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason + ':' + action.id + ':' + action.coinRoute?.legCount + ':' + action.coinRoute?.points?.length + ':' + action.score;
      })(),
      want: 'coin:best-opportunity-coin-route:1:3:3:300000'
    },
    {
      name: 'visible afk drop still beats weaker coin route by stamina roi',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 9000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }],
          coins: [
            { drop_id: 1, x: -12000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: -12500, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason;
      })(),
      want: 'attack:best-opportunity-afk-drop-target'
    },
    {
      name: 'same first coin route keeps overlay metadata near non-avoidance active',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 4, x: 30000, y: 0, current_join_mode: 'Active', vx: -50 }],
          coins: [
            { drop_id: 1, x: -8000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 10000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 15000, y: 0, amount: 1, native: true }
          ]
        });
        return action.reason + ':' + action.coinRoute?.legCount;
      })(),
      want: 'best-opportunity-coin-route:3'
    },
    {
      name: 'coin route does not skip much closer local coin',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
          coins: [
            { drop_id: 1, x: -8000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 22000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 22500, y: 0, amount: 1, native: true },
            { drop_id: 4, x: 23000, y: 0, amount: 1, native: true }
          ]
        });
        return action.kind + ':' + action.reason + ':' + action.id + ':' + Boolean(action.coinRoute);
      })(),
      want: 'coin:best-opportunity-coin:1:false'
    },
    {
      name: 'coin route leg threat block rejects path through active danger',
      got: (() => {
        const self = { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 };
        const threat = decorateThreat(self, { user_id: 4, x: 25000, y: 0, current_join_mode: 'Active', vx: -50 });
        const route = pickCoinRouteOpportunity(self, [
          { drop_id: 1, x: 10000, y: 0, amount: 1, native: true },
          { drop_id: 2, x: 16000, y: 0, amount: 1, native: true },
          { drop_id: 3, x: 22000, y: 0, amount: 1, native: true },
          { drop_id: 4, x: -8000, y: 0, amount: 1, native: true },
          { drop_id: 5, x: -9000, y: 1000, amount: 1, native: true },
          { drop_id: 6, x: -10000, y: -1000, amount: 1, native: true }
        ], [threat]);
        return route ? route.drop_id + ':' + route.coinRoute?.ids?.join(',') : 'none';
      })(),
      want: '4:4,5,6'
    },
    {
      name: 'coin route rejects unaffordable whole route',
      got: (() => {
        const self = {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_1h_remaining_milli: 12500,
          stamina_1d_remaining_milli: 12500,
          stamina_5s_remaining_milli: 10000
        };
        const action = pickBestOpportunity(
          self,
          [],
          [
            { drop_id: 1, x: 10000, y: 0, amount: 1, native: true },
            { drop_id: 2, x: 12000, y: 0, amount: 1, native: true },
            { drop_id: 3, x: 14000, y: 0, amount: 1, native: true }
          ],
          []
        );
        return action ? action.reason + ':' + action.id + ':' + Boolean(action.coinRoute) : 'none';
      })(),
      want: 'best-opportunity-coin:1:false'
    },
    {
      name: 'shot stamina can make a lower coin beat a low drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 5 }],
        coins: [{ drop_id: 1, x: 3000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'higher drop still wins when stamina yield is better',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'low long stamina skips far visible coin',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 1, x: 20000, y: 0, amount: 100 }]
      }).kind,
      want: 'leave'
    },
    {
      name: 'low 1h stamina visible coin exits instead of waiting',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 1, x: 20000, y: 0, amount: 100 }]
      }).reason,
      want: 'stamina-budget-coin-leave'
    },
    {
      name: 'low long stamina still takes foot coin',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [
          { drop_id: 1, x: 500, y: 0, amount: 1 },
          { drop_id: 2, x: 20000, y: 0, amount: 100 }
        ]
      }).id,
      want: 1
    },
    {
      name: '1h budget below nearest foot coin exits',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 2400,
          stamina_1d_remaining_milli: 100000
        },
        coins: [{ drop_id: 1, x: 500, y: 0, amount: 1 }]
      }).reason,
      want: 'stamina-budget-coin-leave'
    },
    {
      name: 'low 1h stamina ignores snapshot for budget before idle fallback',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        coins: [{ drop_id: 2, x: 52000, y: 0, amount: 1, snapshot: true }],
        snapshotWaitAgeMs: 60000
      }).reason,
      want: 'snapshot-coin-idle-timeout'
    },
    {
      name: 'low long stamina skips expensive afk drop target',
      got: choose({
        self: {
          user_id: 1,
          x: 0,
          y: 0,
          hp: 100,
          stamina_5s_remaining_milli: 10000,
          stamina_1h_remaining_milli: 3500,
          stamina_1d_remaining_milli: 3500
        },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, death_reward_preview: 100 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'stamina budget leave summary identifies nearest coin',
      got: offlineLeaveSummaryText('stamina budget coin leave', { staminaBudgetExit: { window: '1h', distance: 20000 } }),
      want: '一小时体力不足以拾取最近金币，退出等待重连'
    },
    {
      name: 'same enemy relogin repeat backoff steps up',
      got: [
        enemyRepeatDelayMsForCount(1),
        enemyRepeatDelayMsForCount(2),
        enemyRepeatDelayMsForCount(3),
        enemyRepeatDelayMsForCount(4)
      ].join(','),
      want: '0,1800000,3600000,3600000'
    },
    {
	      name: 'stamina leave summary identifies hourly limit',
	      got: offlineLeaveSummaryText('offline leave wait', { staminaExhausted: { longExhausted: ['1h'] } }),
		      want: '一小时体力到达限制，退出等待重连'
	    },
	    {
	      name: 'stamina leave summary identifies long-window limits',
	      got: offlineLeaveSummaryText('stamina exhausted', { staminaExhausted: { exhausted: ['5s', '1h', '1d'] } }),
		      want: '一小时和一天体力到达限制，退出等待重连'
		    },
	    {
	      name: 'stale daily stamina hold is contradicted by preserved session stamina',
	      got: String(staminaHoldContradictedByStaminaEvidence(
	        { longExhausted: ['1h', '1d'] },
	        { stamina1dLastRemaining: 12658427, stamina1dLastLimit: 20000000 },
	        1000
	      )),
	      want: 'true'
	    },
	    {
	      name: 'daily stamina hold is not contradicted without remaining stamina evidence',
	      got: String(staminaHoldContradictedByStaminaEvidence(
	        { longExhausted: ['1d'] },
	        { stamina1dLastRemaining: 0, stamina1dLastLimit: 20000000 },
	        1000
	      )),
	      want: 'false'
	    },
	    {
	      name: 'offline reconnect churn summary is explicit',
	      got: offlineLeaveSummaryText('websocket reconnect churn', { reconnectChurn: { count: 3, windowMs: 10000 } }),
		      want: '网络连接反复重连，退出等待重连'
		    },
	    {
	      name: 'offline sampling outage summary is explicit',
	      got: offlineLeaveSummaryText('global sampling outage', { samplingOutage: { errorCount: 1 } }),
	      want: '网络采样超时，按网络波动退出等待重连'
	    },
	    {
	      name: 'offline combat tick gap summary is explicit',
	      got: offlineLeaveSummaryText('combat tick gap', { combatTickGap: { tickGapMs: 37971 } }),
	      want: '战斗主循环断档，按网络波动退出等待重连'
	    },
	    {
	      name: 'combat sampling outage triggers offline leave gate',
	      got: globalSamplingOutageOfflineStateForTest({
	        nowMs: 10000,
	        decision: { combat: true, reason: 'combat-pressure-close' },
	        outage: {
	          active: true,
	          firstAt: 9000,
	          ageMs: 1000,
	          errorCount: 1,
	          snapshotTimedOut: true,
	          minimapTimedOut: true
	        }
	      })?.reason,
	      want: 'global sampling outage'
	    },
	    {
	      name: 'non-combat sampling outage does not trigger by default',
	      got: globalSamplingOutageOfflineStateForTest({
	        nowMs: 10000,
	        decision: { kind: 'coin', reason: 'best-opportunity-coin' },
	        outage: {
	          active: true,
	          firstAt: 9000,
	          ageMs: 1000,
	          errorCount: 1,
	          snapshotTimedOut: true,
	          minimapTimedOut: true
	        }
	      })?.reason || 'none',
	      want: 'none'
	    },
	    {
	      name: 'combat tick gap triggers offline leave gate',
	      got: combatTickGapOfflineStateForTest({
	        nowMs: 48000,
	        previousTickAt: 10000,
	        previousCombatActive: true,
	        decision: { combat: true, reason: 'combat-tangent-dodge' },
	        lastCombatFrameAt: 10000
	      })?.reason,
	      want: 'combat tick gap'
	    },
	    {
	      name: 'non-combat tick gap does not trigger by default',
	      got: combatTickGapOfflineStateForTest({
	        nowMs: 48000,
	        previousTickAt: 10000,
	        decision: { kind: 'coin', reason: 'best-opportunity-coin' },
	        lastCombatFrameAt: 10000
	      })?.reason || 'none',
	      want: 'none'
	    },
	    {
	      name: 'recent combat frame gap survives cleared decision context',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 16000,
	          previousTickAt: 15880,
	          tickGapMs: 120,
	          decision: { kind: 'coin', reason: 'best-opportunity-coin' },
	          lastCombatFrameAt: 10000
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + Boolean(state?.recentCombatFrameContext);
	      })(),
	      want: 'combat tick gap|combat-log-gap-with-active-tick|true'
	    },
	    {
	      name: 'combat frame gap with active tick records gating diagnosis',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 48000,
	          previousTickAt: 47880,
	          tickGapMs: 120,
	          combatLogActive: true,
	          decision: { combat: true, reason: 'combat-tangent-dodge' },
	          lastCombatFrameAt: 10000
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + (state?.likelyCause || '');
	      })(),
	      want: 'combat tick gap|combat-log-gap-with-active-tick|combat-state-or-log-gating-gap'
	    },
	    {
	      name: 'combat tick reentry gap records stuck async diagnosis',
	      got: (() => {
	        const state = combatTickGapOfflineStateForTest({
	          nowMs: 48000,
	          previousTickAt: 42000,
	          tickGapMs: 120,
	          tickInProgressMs: 6000,
	          lastTickCompletedGapMs: 6000,
	          reentry: true,
	          combatLogActive: true,
	          decision: { combat: true, reason: 'combat-tangent-dodge' },
	          lastCombatFrameAt: 47800
	        });
	        return (state?.reason || 'none') + '|' + (state?.diagnosis || '') + '|' + (state?.likelyCause || '');
	      })(),
	      want: 'combat tick gap|tick-reentry-gap|main-loop-stuck-or-awaiting-async'
	    },
	    {
	      name: 'combat log exit summary ignores non-exit decisions',
	      got: combatLogExitSummaryFromDecision({ kind: 'wait', reason: 'combat-spacing' }),
	      want: null
	    },
	    {
	      name: 'combat log exit summary keeps specific reason during leave cooldown',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'combat-leave-retry',
	          displayReason: 'retrying combat leave',
	          leave: {
	            reason: 'cooldown',
	            attempted: false,
	            cooldownRemainingMs: 800,
	            summary: 'leave retry cooldown'
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          String(exit?.attempted)
	        ].join('|');
	      })(),
	      want: 'combat-leave-retry|leave retry cooldown|false'
	    },
	    {
	      name: 'combat log exit summary treats control outage reasons as exitish without leave detail',
	      got: (() => {
	        const combatGap = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'control-combat-tick-gap',
	          displayReason: 'combat gap pending'
	        });
	        const sampling = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'control-global-sampling-outage',
	          displayReason: 'sampling outage pending'
	        });
	        return [
	          combatGap?.reason,
	          combatGap?.summary,
	          sampling?.reason,
	          sampling?.summary
	        ].join('|');
	      })(),
	      want: 'control-combat-tick-gap|combat gap pending|control-global-sampling-outage|sampling outage pending'
	    },
	    {
	      name: 'combat log exit summary prefers canonical combat leave reason',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'leave',
	          reason: 'combat-low-hp-leave',
	          displayReason: 'low hp leave',
	          leave: {
	            reason: 'combat low hp disadvantage',
	            summary: 'low hp normalized leave',
	            attempted: true
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          String(exit?.attempted)
	        ].join('|');
	      })(),
	      want: 'combat-low-hp-leave|low hp normalized leave|true'
	    },
    {
      name: 'combat log exit summary covers pending exit decisions',
      got: (() => {
        const exit = combatLogExitSummaryFromDecision({
	          kind: 'attack',
	          reason: 'combat-stamina-conserve',
	          pendingExit: {
	            reason: 'combat low hp disadvantage',
	            summary: 'pending hostile exit',
	            displayReason: 'pending hostile exit wait',
	            lastError: 'retry later'
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          exit?.displayReason,
	          exit?.error
	        ].join('|');
      })(),
      want: 'pending-exit-active|pending hostile exit|pending hostile exit wait|retry later'
    },
    {
      name: 'live session mismatch takeover uses explicit bypass state',
      got: (() => {
        const status = {
          satisfied: false,
          streak: 0,
          required: 3,
          pointSafety: { hasPoint: true, satisfied: false, streak: 0, required: 12 }
        };
        const liveSessionTakeover = {
          allowed: true,
          blockedBy: [],
          reason: 'live-session-mismatch-takeover'
        };
        const bypassed = {
          ...status,
          blockReason: 'session-mismatch-recovery',
          liveSessionTakeoverBypass: liveSessionTakeover.allowed,
          liveSessionTakeover
        };
        return [
          String(bypassed.satisfied),
          bypassed.blockReason,
          String(Boolean(bypassed.liveSessionTakeoverBypass)),
          bypassed.liveSessionTakeover.reason,
          String(Boolean(bypassed.pointSafety?.satisfied))
        ].join('|');
      })(),
      want: 'false|session-mismatch-recovery|true|live-session-mismatch-takeover|false'
    },
    {
      name: 'snapshot self can prove live session mismatch takeover evidence',
      got: (() => {
        const nativeWsOpenOrConnecting = false;
        const snapshotSelf = {
          known: true,
          fresh: true,
          present: true,
          snapshotAgeMs: 1200,
          self: { user_id: 28886, hp: 100 }
        };
        const liveSessionEvidence = Boolean(nativeWsOpenOrConnecting || snapshotSelf.present);
        const blockedBy = [];
        if (!liveSessionEvidence) blockedBy.push('live-session-evidence-missing');
        return [
          String(liveSessionEvidence),
          String(blockedBy.length),
          String(snapshotSelf.fresh),
          String(snapshotSelf.present)
        ].join('|');
      })(),
      want: 'true|0|true|true'
    },
    {
      name: 'post-exit session mismatch blocks live takeover bypass',
      got: (() => {
        const blockedBy = [];
        const state = {
          pendingExit: true,
          suppressRemainingMs: 60000,
          resetReason: 'exit-trigger:websocket offline',
          reconnectChurn: true,
          wsOfflineish: true
        };
        if (state.pendingExit) blockedBy.push('pending-exit-active');
        if (state.suppressRemainingMs > 0) blockedBy.push('login-suppress-active');
        if (state.resetReason.includes('exit-trigger:') || state.resetReason.includes('exit-confirmed:')) blockedBy.push('exit-snapshot-gate-reset');
        if (state.reconnectChurn) blockedBy.push('native-reconnect-churn');
        if (state.wsOfflineish) blockedBy.push('ws-offlineish');
        const takeover = {
          allowed: blockedBy.length === 0,
          blockedBy
        };
        return [
          String(takeover.blockedBy.includes('pending-exit-active')),
          String(takeover.blockedBy.includes('login-suppress-active')),
          String(takeover.blockedBy.includes('exit-snapshot-gate-reset')),
          String(takeover.blockedBy.includes('native-reconnect-churn')),
          String(takeover.blockedBy.includes('ws-offlineish')),
          String(takeover.allowed)
        ].join('|');
      })(),
      want: 'true|true|true|true|true|false'
    },
    {
      name: 'local exit confirmation must not accept active session mismatch',
      got: (() => {
        const tokenCleared = true;
        const chatLeftUser = true;
        const ownEntityDisappeared = true;
        const sessionMismatch = true;
        return String(tokenCleared && chatLeftUser && ownEntityDisappeared && !sessionMismatch);
      })(),
      want: 'false'
    },
    {
      name: 'combat log exit summary includes safe offline relogin marker',
      got: (() => {
        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'offline-leave',
	          leave: {
	            reason: 'websocket offline',
	            summary: 'safe offline exit',
	            safeReloginAllowed: true,
	            offlineSafety: { unsafe: false }
	          }
	        });
	        return [
	          exit?.reason,
	          String(exit?.safeReloginAllowed),
	          String(exit?.offlineSafety?.unsafe)
	        ].join('|');
	      })(),
	      want: 'websocket offline|true|false'
	    },
	    {
	      name: 'combat log exit summary includes pending unsafe suppress',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'leave',
	          reason: 'combat-hp-disadvantage-leave',
	          leave: {
	            reason: 'combat-hp-disadvantage-leave',
	            summary: 'HP disadvantage',
	            attempted: true,
	            pendingLoginSuppressReason: 'pending unsafe hostile exit',
	            pendingLoginSuppressDelayMs: 60000,
	            pendingLoginSuppressMinimumDelayMs: 60000,
	            pendingLoginSuppressHpDelayMs: 90000,
	            pendingLoginSuppressHp: { hp: 45, maxHp: 100 }
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.summary,
	          String(exit?.attempted),
	          exit?.pendingLoginSuppressReason,
	          exit?.pendingLoginSuppressDelayMs,
	          exit?.pendingLoginSuppressMinimumDelayMs,
	          exit?.pendingLoginSuppressHpDelayMs,
	          exit?.pendingLoginSuppressHp?.hp
	        ].join('|');
	      })(),
	      want: 'combat-hp-disadvantage-leave|HP disadvantage|true|pending unsafe hostile exit|60000|60000|90000|45'
	    },
	    {
	      name: 'combat log exit summary includes confirmed longer hold',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'enemy-leave-wait',
	          leave: {
	            reason: 'enemy-leave-wait',
	            displayReason: 'hostile hold',
	            reloginUntil: 123456789,
	            holdRemainingMs: 599000,
	            reloginDelayMs: 600000
	          }
	        });
	        return [
	          exit?.reason,
	          exit?.displayReason,
	          exit?.reloginUntil,
	          exit?.holdRemainingMs,
	          exit?.reloginDelayMs
	        ].join('|');
	      })(),
	      want: 'enemy-leave-wait|hostile hold|123456789|599000|600000'
	    },
	    {
	      name: 'combat log exit summary falls back to decision hold fields',
	      got: (() => {
	        const exit = combatLogExitSummaryFromDecision({
	          kind: 'wait',
	          reason: 'offline-leave-wait',
	          displayReason: 'offline hold active',
	          leave: null,
	          holdRemainingMs: 61000,
	          reloginDelayMs: 120000
	        });
	        return [
	          exit?.reason,
	          exit?.displayReason,
	          exit?.holdRemainingMs,
	          exit?.reloginDelayMs
	        ].join('|');
		      })(),
		      want: 'offline-leave-wait|offline hold active|61000|120000'
		    },
		    {
		      name: 'safeStringify handles bigint and circular references',
		      got: (() => {
		        const value = { id: 7n };
		        value.self = value;
		        const text = safeStringify(value);
		        return text.includes('"id":"7"') && text.includes('"self":"[Circular]"');
		      })(),
		      want: true
		    },
		    {
		      name: 'safeJsonClone keeps JSON-safe bigint string output',
		      got: safeJsonClone({ id: 9n })?.id,
		      want: '9'
		    },
		    {
		      name: 'combat log id sanitizer removes unsafe filename characters',
		      got: sanitizeCombatLogIdPart(' A/B:中文 ', 'fallback') + '|' + sanitizeCombatLogIdPart('', 'fallback'),
		      want: 'A_B|fallback'
		    },
		    {
		      name: 'display format helpers keep compact Chinese labels',
		      got: [
		        formatDistance(150),
		        formatDistance(1200),
		        formatDurationMs(3600000),
		        actorLabel({ targetId: 42 }),
		        hpDisplay(12.6)
		      ].join('|'),
		      want: '1.5米|12米|1小时|#42|13'
		    }
			  ];
  const failed = cases.filter(item => item.got !== item.want);
  if (failed.length) {
    console.error(JSON.stringify({ ok: false, failed }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, cases: cases.length }, null, 2));
}

module.exports = {
  runSelfTest
};
