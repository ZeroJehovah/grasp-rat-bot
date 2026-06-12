#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');

const DEFAULT_CDP = process.env.CDP_URL || 'http://172.24.0.1:9224';
const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top/';
const CDP_HTTP_TIMEOUT_MS = 1000;

const options = parseArgs(process.argv.slice(2));

function parseArgs(args) {
  const out = {
    cdp: DEFAULT_CDP,
    durationSec: 0,
    dryRun: false,
    once: false,
    statusOnly: false,
    diagnoseOnly: false,
    selfTest: false,
    bringToFront: false,
    printSource: false,
    statusEvery: 1000,
    pageWs: '',
    overrides: {},
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--cdp') out.cdp = args[++i];
    else if (arg === '--duration') out.durationSec = Number(args[++i] || 0);
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--once') out.once = true;
    else if (arg === '--status') out.statusOnly = true;
    else if (arg === '--diagnose') out.diagnoseOnly = true;
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--front') out.bringToFront = true;
    else if (arg === '--print-source') out.printSource = true;
    else if (arg === '--page-ws') out.pageWs = args[++i] || '';
    else if (arg === '--status-every') out.statusEvery = Number(args[++i] || out.statusEvery);
    else if (arg === '--bot-version') out.overrides.version = args[++i] || '';
    else if (arg === '--danger-radius') out.overrides.dangerRadius = Number(args[++i]);
    else if (arg === '--global-attack-max') out.overrides.globalAttackMaxDistance = Number(args[++i]);
    else if (arg === '--global-coin-max') out.overrides.globalCoinMaxDistance = Number(args[++i]);
    else if (arg === '--tick-ms') out.overrides.tickMs = Number(args[++i]);
    else if (arg === '--low-hp') out.overrides.lowHpThreshold = Number(args[++i]);
    else if (arg === '--conserve-stamina') out.overrides.conserveStaminaThreshold = Number(args[++i]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node grasp-rat-bot.js [options]

Controls the already-open 囤囤鼠历险记 Chrome tab through CDP.

Options:
  --cdp <url>             CDP HTTP base URL. Default: ${DEFAULT_CDP}
  --duration <seconds>    Stop after N seconds. Default: run until Ctrl+C
  --dry-run               Read state and choose actions without sending commands
  --once                  Run one decision tick and exit
  --status                Print current in-page bot status and exit
  --diagnose              Print login, WebSocket, self, and recent log details
  --self-test             Run local strategy unit checks and exit
  --front                 Bring the game tab to the foreground while attaching
  --print-source          Print the browser injection source and exit
  --page-ws <url>         Attach directly to a page WebSocketDebuggerUrl
  --status-every <ms>     Browser console status interval. Default: 1000
  --bot-version <value>   Version label exposed in browser bot status
  --danger-radius <cm>    Flee from active local units within this range
  --global-attack-max <cm>  Max distance for far Drop targets
  --global-coin-max <cm>  Max distance for far coins
  --tick-ms <ms>          Decision interval. Default: 120
  --low-hp <hp>           Avoid attacks below this HP. Default: 60
  --conserve-stamina <ms> Compatibility option; stamina no longer blocks non-healing actions
`);
}

function writeStdoutSync(text) {
  const buffer = Buffer.from(String(text));
  let offset = 0;
  while (offset < buffer.length) {
    try {
      const written = fs.writeSync(process.stdout.fd, buffer, offset, Math.min(buffer.length - offset, 65536));
      if (written > 0) {
        offset += written;
      } else {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    } catch (err) {
      if (err?.code === 'EAGAIN' || err?.code === 'EWOULDBLOCK') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        continue;
      }
      throw err;
    }
  }
}

function staminaExhaustedWindowLabel(staminaState) {
  const raw = Array.isArray(staminaState?.longExhausted)
    ? staminaState.longExhausted
    : (Array.isArray(staminaState?.exhausted) ? staminaState.exhausted : []);
  const windows = [];
  for (const item of raw) {
    const key = String(item || '').toLowerCase();
    if ((key === '1h' || key === '1d') && !windows.includes(key)) windows.push(key);
  }
  return windows.join('/');
}

function offlineLeaveSummaryText(reason, offlineSafety) {
  if (offlineSafety?.staminaBudgetExit) return '1h体力不足以拾取最近金币，退出等待重连';
  const staminaLabel = staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
  if (staminaLabel) return staminaLabel + '体力到达限制，退出等待重连';
  const text = String(reason || '').toLowerCase();
  if (text.includes('stamina')) return '长周期体力到达限制，退出等待重连';
  if (offlineSafety?.noSelfGameSession || text.includes('missing self')) return '已登录但自身实体不可见，退出等待重连';
  if (text.includes('reconnect churn') || offlineSafety?.reconnectChurn) return 'WebSocket 反复重连，退出等待重连';
  if (text.includes('server position')) return '服务端位置停止，按离线处理，退出等待重连';
  if (offlineSafety?.unsafe) return 'WebSocket 离线且周围危险，退出等待重连';
  return 'WebSocket 离线，退出等待重连';
}

function combatLogExitSummaryFromDecision(decision) {
  const leave = decision?.leave || null;
  const detail = leave || decision || {};
  const leaveReason = String(leave?.reason || '');
  const decisionReason = String(decision?.reason || '');
  const pendingExit = decision?.pendingExit && typeof decision.pendingExit === 'object' ? decision.pendingExit : null;
  const canonicalCombatReason = /^combat-[a-z0-9-]+-leave$/.test(decisionReason) ? decisionReason : '';
  const exitishDecisionReason = /(?:combat|injury|pursuit|offline|stamina).*leave|leave-(?:retry|wait)|control-ws|stamina-exhausted/.test(decisionReason)
    ? decisionReason
    : '';
  const reason = canonicalCombatReason
    || (leaveReason && leaveReason !== 'cooldown' ? leaveReason : '')
    || (pendingExit ? 'pending-exit-active' : '')
    || exitishDecisionReason
    || decisionReason
    || leaveReason;
  const isExit = Boolean(leave)
    || Boolean(pendingExit)
    || decision?.kind === 'leave'
    || /(?:combat|injury|pursuit|offline|stamina).*leave|leave-(?:retry|wait)|control-ws|stamina-exhausted/.test(reason);
  if (!isExit) return null;
  return {
    reason,
    summary: leave?.summary || leave?.exitSummary || pendingExit?.summary || decision?.exitSummary || decision?.displayReason || '',
    displayReason: leave?.displayReason || pendingExit?.displayReason || decision?.displayReason || '',
    attempted: leave ? Boolean(leave.attempted) : null,
    error: leave?.error || pendingExit?.lastError || '',
    safeReloginAllowed: Boolean(detail.safeReloginAllowed || decision?.safeReloginAllowed),
    offlineSafety: detail.offlineSafety || decision?.offlineSafety || null,
    reloginUntil: detail.reloginUntil || 0,
    holdRemainingMs: detail.holdRemainingMs || 0,
    reloginDelayMs: detail.reloginDelayMs || 0,
    pendingLoginSuppressUntil: detail.pendingLoginSuppressUntil || 0,
    pendingLoginSuppressDelayMs: detail.pendingLoginSuppressDelayMs || 0,
    pendingLoginSuppressReason: detail.pendingLoginSuppressReason || '',
    pendingLoginSuppressMinimumDelayMs: detail.pendingLoginSuppressMinimumDelayMs || 0,
    pendingLoginSuppressHpDelayMs: detail.pendingLoginSuppressHpDelayMs || 0,
    pendingLoginSuppressHp: detail.pendingLoginSuppressHp || null
  };
}

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
    attackApproachRange: 26000,
    attackPreferredRange: 14500,
    globalAttackMaxDistance: 26000,
    nativeEntityAuthoritativeRadius: 42000,
    nativeCoinAuthoritativeRadius: 50000,
    combatAttackRange: 14500,
    combatCriticalHpLeaveThreshold: 20,
    combatLowHpLeaveThreshold: 50,
    combatLowHpCloseRiskMargin: 5,
    combatHighHpDisadvantageGap: 20,
    combatLowHpNoDamageLeaveThreshold: 70,
    combatLowHpNoDamageLeaveMs: 15000,
    combatLowHpNoDamageMinGap: 0,
    combatShootEveryMs: 160,
    combatShootReserveMs: 5600,
    combatShootDodgeReserveMs: 3800,
    combatShootHighHpDodgeReserveMs: 3000,
    combatShootHighHpMinHp: 90,
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
    combatAimNoDamageMs: 1000,
    combatAimNoDamageStepMs: 800,
    combatAimNoDamageMaxRadians: 0.14,
    combatAimLockMs: 450,
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
    combatEngageGraceRange: 22000,
    combatSpacingMinRange: 4500,
    combatSpacingPreferredRange: 6500,
    combatSpacingEmergencyRange: 3000,
    combatSpacingLowHpThreshold: 70,
    combatPressureCloseNoDamageMs: 8000,
    combatPressureCloseRange: 6500,
    combatPressureCloseMinHp: 60,
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
    opportunitySameCoinRadius: 1200,
    opportunityNearbyPriorityDistance: 18000,
    coinMaxDistance: 18000,
    coinDangerRadius: 25000,
    invulnerableActiveCoinDangerRadius: 36000,
    invulnerableActiveCoinHeadingBlockRadius: 65000,
    invulnerableActiveCoinHeadingLaneRadius: 18000,
    invulnerableActiveCoinHeadingCosMin: 0.55,
    invulnerableActiveCoinHeadingMinDistance: 1500,
    stationaryActiveCoinDangerRadius: 12000,
    globalCoinMaxDistance: 22000,
    patrolCoinMaxDistance: 22000,
    scanCoinMaxDistance: 22000,
    distantCoinMaxDistance: 35000,
    distantCoinMinDistance: 22000,
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
    attackMinStamina: 0,
    passiveAvoidRadius: 11000,
    passivePanicRadius: 120,
    recoveryAvoidRadius: 22000,
    lowHpThreshold: 60,
    recoverHpThreshold: 95,
    staminaFullRatio: 0.98,
    conserveStaminaThreshold: 6500,
    staminaBudgetReloginDelayMs: 300000,
    pursuitLeaveMs: 300000,
    pursuitLeaveNonFullHpMs: 90000,
    pursuitLeaveInvulnerableMs: 60000,
    pursuitLeaveNonFullHpInvulnerableMs: 45000,
    targetStickMs: 5000,
    coinStickMs: 2500,
  };
  const bot = { lastTarget: null, lastTargetAt: 0, combatTarget: null, opportunityChoice: null };
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
  const isRecoveryUnsafeHuman = e => isActive(e);
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
    const afk = isAfkProfitTarget(target);
    const stopDistance = afk ? cfg.attackRange : cfg.attackEngageRange;
    const moveCost = opportunityMoveStaminaCost(target?.distance, stopDistance);
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
      reloginDelayMs: Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 300000))
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
      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 300000))
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

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
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
    const nearDistance = Math.max(0, Number(cfg.opportunityNearbyPriorityDistance || 0));
    if (Number.isFinite(distance) && distance <= nearDistance) return 1;
    if (item?.type === 'enemy' && item?.kind === 'attack') return 1;
    return 0;
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
    if (current) {
      const same = opportunityMatchesChoice(chosen, current);
      const missingHold = Boolean(chosen.missingHold);
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
        missingSince: missingHold ? Number(current?.missingSince || t) : 0
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

  function pickEngagedCombatTarget(self, entities) {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return null;
    const target = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .find(e => String(e.user_id ?? e.id ?? '') === String(engaged.id));
    if (!target || isWhitelistedTarget(target) || isInvulnerable(target)) return null;
    const distance = dist(self, target);
    if (distance > Math.max(cfg.combatAttackRange, cfg.combatEngageGraceRange)) return null;
    return {
      ...target,
      distance,
      drop: dropValue(target),
      speed: speed(target),
      hp: combatHpValue(target),
      knownHp: knownHpValue(target),
      combatIntent: 'engaged'
    };
  }
  function defensiveTargetOverridesEngaged(engagedTarget, defensiveTarget) {
    if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
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
    if (incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId)) return true;
    if (isFiringEntity(target)) return true;
    if (isActive(target)) return true;
    return Boolean(unknownIncoming && isActive(target));
  }
  function isProfitableCombatTarget(target) {
    return Boolean(target && !isWhitelistedTarget(target) && !isAfkProfitTarget(target) && !isInvulnerable(target) && isActive(target) && Number(target.drop || 0) > 0);
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
    const candidates = entities
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => !isInvulnerable(e))
      .filter(e => e.distance <= cfg.combatAttackRange);
    const incoming = (bullets || []).find(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) !== Number(self.user_id));
    const incomingOwnerId = incoming ? (incoming.owner_id ?? incoming.ownerId ?? incoming.source_user_id ?? incoming.user_id) : null;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    if (incoming) {
      const shooter = candidates.find(e => String(e.user_id) === String(incomingOwnerId));
      if (shooter) return { ...shooter, incomingBullet: incoming, combatIntent: 'defensive' };
    }
    const eligibleTargets = candidates.filter(e => !isAfkProfitTarget(e));
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
      .filter(item => !(entities || []).some(e => String(e.user_id ?? e.id ?? '') === String(item.id) && isAlive(e)));
    if (!recentAttacks.length) return null;
    const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
    const candidates = [];
    for (const coin of coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > minAmount)
      .filter(c => c.distance <= cfg.postAttackDropCoinMaxDistance)
      .filter(c => !activeThreats.some(threat => coinBlockedByThreat(self, c, threat)))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)))) {
      const attack = recentAttacks
        .filter(item => dist(coin, item) <= cfg.postAttackDropCoinRadius)
        .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(b.at || 0) - Number(a.at || 0))[0] || null;
      if (!attack) continue;
      const score = scoreCoinOpportunity(coin);
      candidates.push({
        ...coin,
        postAttackScore: score,
        postAttackTarget: {
          id: attack.id,
          name: attack.name || '',
          drop: attack.drop,
          ageMs: Math.max(0, Math.round(t - Number(attack.at || t)))
        }
      });
    }
    return candidates
      .sort((a, b) => b.amount - a.amount || b.postAttackScore - a.postAttackScore || a.distance - b.distance)[0] || null;
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

  function actorLabel(target) {
    if (!target) return '未知目标';
    return target.name || ('#' + (target.user_id ?? target.id ?? '-'));
  }
  function hpDisplay(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : '-';
  }
  function combatExitSummary(reason, target, combatState = {}) {
    const selfHp = Number(combatState.selfHp ?? NaN);
    const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
    const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
    if (reason === 'combat-critical-hp-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
    }
    if (reason === 'combat-hp-disadvantage-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方HP ' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + '，劣势退出';
    }
    if (reason === 'combat-low-hp-no-damage-leave') {
      const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
        ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方HP ' + hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
    }
    if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
      const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
        ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方HP ' + hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
    }
    return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方HP ' + hpDisplay(targetHp) + '，劣势退出';
  }
  function combatLeaveCoverAction(self, target, bullets = []) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const incoming = isFiringEntity(target) || (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
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

  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const selfHp = hpValue(self);
    const targetHp = Number(options.targetHp);
    const highHpMin = Math.max(0, Number(cfg.combatShootHighHpMinHp || 0));
    const highHpFireWindow = highHpMin > 0
      && Number.isFinite(selfHp)
      && selfHp >= highHpMin
      && (!Number.isFinite(targetHp) || selfHp >= targetHp);
    const effectiveDodgeReserveMs = highHpFireWindow
      ? Math.min(dodgeReserveMs, highHpDodgeReserveMs)
      : dodgeReserveMs;
    const needsMovement = Boolean(options.needsMovement || options.dodging || options.realBulletPressure);
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
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
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
	    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
	      && Number.isFinite(hpGap)
	      && hpGap > cfg.combatHighHpDisadvantageGap) {
	      return combatLeaveAction('combat-hp-disadvantage-leave', self, target, { hpGap }, bullets);
	    }
    const noDamageMs = combatTargetNoDamageMs(target);
    const motionScale = combatAimMotionScale(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const incoming = isFiringEntity(target) || (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
    const spacing = combatSpacingVector(self, target, target.distance);
    const closeRisk = combatLowHpCloseRiskState(selfHp, targetHp, spacing, incoming);
    if (closeRisk) {
      return combatLeaveAction('combat-low-hp-leave', self, target, { closeRisk }, bullets);
    }
    const pressureClose = combatPressureCloseVector(self, target, target.distance, selfHp);
    const spacingOverride = incoming && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    const requestedDx = pressureClose.active ? pressureClose.dx : (spacingOverride ? spacing.dx : (incoming ? 1 : spacing.dx));
    const requestedDy = pressureClose.active ? pressureClose.dy : (spacingOverride ? spacing.dy : (incoming ? 1 : spacing.dy));
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
    const shooting = combatShootingPlan(self, {
      needsMovement: Boolean(requestedDx || requestedDy),
      dodging: incoming,
      realBulletPressure: incoming,
      targetHp
    });
    const baseReason = incoming
      ? (spacingOverride ? 'combat-spacing-dodge' : 'combat-tangent-dodge')
      : (spacing.active ? 'combat-spacing' : (pressureClose.active ? 'combat-pressure-close' : 'combat-attack'));
    return {
      kind: 'attack',
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed ? 'combat-stamina-conserve' : (shooting.throttled ? 'combat-burst-fire' : baseReason)),
      combat: true,
      ignoreReturnBlock: true,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      dx,
      dy,
      aimMode: moving ? 'jitter' : 'exact',
      aimJitterLimit: moving ? Number(combatAimJitterLimit(target.distance, motionScale).toFixed(4)) : 0,
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
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
          noDamageMs: Math.round(pressureClose.noDamageMs)
        } : null,
        noDamageMs,
        movementSuppressed,
        shooting
      }
    };
  }

  function pickBestOpportunity(self, entities, coins, activeThreats, snapshotCompetitionCoin = null, fieldCompetitionCoin = null) {
    const opportunities = [];
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      const staminaCost = opportunityCoinStaminaCost(coin);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      opportunities.push({
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
    if (snapshotCompetitionCoin && !opportunities.some(item => item.type === 'coin' && String(item.id) === String(snapshotCompetitionCoin.drop_id))) {
      const staminaCost = opportunityCoinStaminaCost(snapshotCompetitionCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        opportunities.push({
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
    if (fieldCompetitionCoin && !opportunities.some(item => item.type === 'coin' && String(item.id) === String(fieldCompetitionCoin.drop_id))) {
      const staminaCost = opportunityCoinStaminaCost(fieldCompetitionCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        opportunities.push({
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
    return chooseStableOpportunity(opportunities);
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

  function choose({ local = [], global = [], coins = [], bullets = [], attacks = [], snapshotWaitAgeMs = 0, self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 } }) {
    const entities = [...global, ...local];
    const fullHp = isFullHp(self);
    const activeThreats = entities
      .filter(isActive)
      .map(e => decorateThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const avoidanceThreats = fullHp ? activeThreats.filter(isInvulnerableActive) : activeThreats;
    const closeThreats = avoidanceThreats.filter(e => e.distance <= e.threatRadius);
    const cautionThreats = avoidanceThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const recovery = !fullHp && isRecovering(self);
    const coinThreats = avoidanceThreats;
    const usableCoins = filterLocalSnapshotCoins(self, coins);
    const engagedCombatTarget = pickEngagedCombatTarget(self, entities);
    const defensiveCombatTarget = pickCombatTarget(self, entities, bullets, { mode: 'defensive' });
    const recoveryCombatTarget = defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)
      ? defensiveCombatTarget
      : (engagedCombatTarget || defensiveCombatTarget);
    if (recovery && recoveryCombatTarget) {
      const recoveryCombatAction = chooseCombatAction(self, recoveryCombatTarget, bullets);
      if (engagedCombatTarget || recoveryCombatAction?.kind === 'leave') return recoveryCombatAction;
    }
    if (!recovery && defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)) {
      return chooseCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!recovery && engagedCombatTarget) return chooseCombatAction(self, engagedCombatTarget, bullets);
    if (fullHp && closeThreats.length) return { kind: 'flee' };
    if (fullHp && cautionThreats.length) return { kind: 'flee' };
    if (!recovery && defensiveCombatTarget) return chooseCombatAction(self, defensiveCombatTarget, bullets);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = usableCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= nearCoinLimit
        && !coinThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const footCoin = usableCoins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= cfg.footCoinPriorityDistance
        && !coinThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const postAttackCoin = pickPostAttackDropCoin(self, usableCoins, coinThreats, attacks, entities, { includeSingle: !recovery });
    if (postAttackCoin) return { kind: 'coin', reason: 'post-attack-drop-coin', id: postAttackCoin.drop_id, amount: postAttackCoin.amount };
    const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExit(
      self,
      safeCoins(self, usableCoins, coinThreats, cfg.snapshotCoinMaxDistance)
    );
    if (staminaBudgetExit) return staminaBudgetCoinLeaveAction(staminaBudgetExit);
    if (recovery && nearCoin) return { kind: 'coin', id: nearCoin.drop_id, amount: nearCoin.amount };
    const nearbyHumans = entities
      .map(e => ({ ...e, distance: dist(self, e) }))
      .filter(e => e.distance <= (recovery ? cfg.recoveryAvoidRadius : cfg.passivePanicRadius));
    const avoidHumans = recovery ? nearbyHumans.filter(isRecoveryUnsafeHuman) : nearbyHumans;
    if (!fullHp && avoidHumans.length) return { kind: 'flee' };
    if (recovery) return { kind: 'recover' };
    if (!fullHp && closeThreats.length) return { kind: 'flee' };
    if (!fullHp && cautionThreats.length) {
      if (!fullHp && footCoin) return { kind: 'coin', reason: 'foot-coin-before-active-caution', id: footCoin.drop_id, amount: footCoin.amount };
      return { kind: 'flee' };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    if (footCoin) return attachOpportunisticShot({ kind: 'coin', reason: 'foot-coin-priority', id: footCoin.drop_id, amount: footCoin.amount }, self, entities, !recovery);
    const localRealtimeCoin = pickRealtimeLocalCoin(self, usableCoins, coinThreats);
    const snapshotCompetitionCoin = localRealtimeCoin ? null : pickSnapshotCoinDestination(self, usableCoins, coinThreats);
    const fieldCompetitionCoin = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickField(self, usableCoins, coinThreats)
      : null;
    const profitableCombatTarget = pickProfitableCombatTarget(self, entities, bullets, usableCoins, coinThreats, snapshotCompetitionCoin, fieldCompetitionCoin);
    if (profitableCombatTarget) return chooseCombatAction(self, profitableCombatTarget, bullets);
    const opportunityTargets = fullHp ? entities.filter(isAfkProfitTarget) : entities;
    const opportunity = pickBestOpportunity(self, opportunityTargets, usableCoins, coinThreats, snapshotCompetitionCoin, fieldCompetitionCoin);
    if (opportunity) return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, opportunity), self, entities, !recovery);
    const distantCoin = pickDistantCoin(self, usableCoins, coinThreats);
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
    const snapshotCoin = snapshotCompetitionCoin;
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
    const shotWait = buildOpportunisticShotWait(self, entities, !recovery);
    if (shotWait) return shotWait;
    if (!localRealtimeCoin && snapshotWaitAgeMs >= cfg.snapshotCoinIdleMaxMs) {
      const idleSnapshotCoin = pickSnapshotCoinDestination(self, usableCoins, coinThreats, { allowIdleFallback: true });
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
    const decoratedCoins = usableCoins
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
      name: 'defensive combat beats coins inside attack range',
      got: choose({
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', firing: true }],
        global: [{ user_id: 3, x: 2000, y: 0, death_reward_preview: 50 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'active combat in range beats foot coin without firing',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 100 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'attack'
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
      name: 'active combat hp gap disadvantage leaves instead of taking coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 91, death_reward_preview: 30 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).reason,
      want: 'combat-hp-disadvantage-leave'
    },
    {
      name: 'near profitable active combat beats far snapshot cluster by yield',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, death_reward_preview: 10 }],
        coins: [
          { drop_id: 11, x: 90000, y: 0, amount: 10 },
          { drop_id: 12, x: 94000, y: 1000, amount: 10 },
          { drop_id: 13, x: 98000, y: -1000, amount: 10 }
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
          { drop_id: 21, x: 90000, y: 0, amount: 4 },
          { drop_id: 22, x: 94000, y: 1000, amount: 4 },
          { drop_id: 23, x: 98000, y: -1000, amount: 4 }
        ]
      }).reason,
      want: 'best-opportunity-afk-drop-target'
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
      name: '150m coin beats richer 200m coin by nearby priority',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 1, x: 15000, y: 0, amount: 1 },
          { drop_id: 2, x: 20000, y: 0, amount: 20 }
        ]
      }).id,
      want: 1
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
      name: 'drop three afk target in range beats 400m visible coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 33, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 40000, y: 0, amount: 50, native: true }]
      }).reason,
      want: 'best-opportunity-afk-drop-target'
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
	      name: 'near realtime coin beats known field migration',
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
	        return action.id + ':' + action.reason;
	      })(),
	      want: '1:best-opportunity-visible-coin'
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
          local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true }],
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
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Active', hp: 80 }]
      }).reason,
      want: 'combat-low-hp-leave'
    },
    {
      name: 'combat leave cover honors short stamina exhaustion',
      got: (() => {
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 40, stamina_5s_remaining_milli: 100 },
          local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true }],
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
          local: [{ user_id: 4, name: '影', x: 1000, y: 0, current_join_mode: 'Passive', hp: 80, firing: true }]
        });
        return action.exitSummary?.includes('与影战斗')
          && action.exitSummary.includes('血量40不足50')
          && action.exitSummary.includes('对方HP 80')
          && action.exitSummary.includes('劣势退出');
      })(),
      want: true
    },
	    {
	      name: 'critical hp combat leaves even when target hp is lower',
	      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true }]
	      }).reason,
	      want: 'combat-critical-hp-leave'
	    },
    {
      name: 'combat critical exit summary includes emergency threshold',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, name: '强敌', x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true }]
      }).exitSummary,
      want: '与强敌战斗，血量19低于20，紧急退出'
    },
	    {
	      name: 'high hp combat gap over threshold leaves immediately',
	      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 91, firing: true }]
      }).reason,
      want: 'combat-hp-disadvantage-leave'
    },
    {
      name: 'recovering combat gap at threshold avoids instead of fighting',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 90, firing: true }]
      }).kind,
      want: 'flee'
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
      name: 'recovering avoids non-firing moving enemy already in range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Passive', vx: 30, death_reward_preview: 7 }]
      }).kind,
      want: 'flee'
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
          local: [{ user_id: 7, x: 14000, y: 0, current_join_mode: 'Active', hp: 97, vx: 50 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'attack:true:7'
    },
    {
      name: 'recovering keeps grace-range combat target before flee mode',
      got: (() => {
        bot.combatTarget = {
          id: 7,
          at: Date.now() - 1000,
          lastInRangeAt: Date.now() - 1000,
          reason: 'combat-stamina-hold'
        };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 97, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [{ user_id: 7, x: 18000, y: 0, current_join_mode: 'Active', hp: 94, vx: 50 }]
        });
        bot.combatTarget = null;
        return action.kind + ':' + Boolean(action.combat) + ':' + action.target?.id;
      })(),
      want: 'attack:true:7'
    },
    {
      name: 'real incoming bullet shooter overrides engaged combat target',
      got: (() => {
        bot.combatTarget = { id: 7, at: Date.now(), lastInRangeAt: Date.now(), reason: 'combat-attack' };
        const action = choose({
          self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
          local: [
            { user_id: 7, name: 'old', x: 10000, y: 0, current_join_mode: 'Active', hp: 100 },
            { user_id: 8, name: 'shooter', x: 9000, y: 0, current_join_mode: 'Active', hp: 100 }
          ],
          bullets: [{ owner_id: 8, x: 8000, y: 0, vx: -100, vy: 0 }]
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
            { user_id: 7, name: 'old', x: 10000, y: 0, current_join_mode: 'Active', hp: 100 },
            { user_id: 8, name: 'firing', x: 9000, y: 0, current_join_mode: 'Active', hp: 100, firing: true }
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
      name: 'non-combat damaged state still flees active danger',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 90, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 16000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'flee'
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
      name: 'combat firing target without visible bullet uses tangent dodge',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, firing: true }]
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
	      name: 'combat moving target uses jitter aim',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', hp: 100, vx: 30, death_reward_preview: 7 }]
      }).aimMode,
      want: 'jitter'
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
      name: 'invulnerable drop target is not attacked',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20, invulnerable: true }]
      }).kind,
      want: 'wait'
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
      name: 'low 1h stamina exits before snapshot idle fallback',
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
      want: 'stamina-budget-coin-leave'
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
      want: '1h体力不足以拾取最近金币，退出等待重连'
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
	      want: '1h体力到达限制，退出等待重连'
	    },
	    {
	      name: 'stamina leave summary identifies long-window limits',
	      got: offlineLeaveSummaryText('stamina exhausted', { staminaExhausted: { exhausted: ['5s', '1h', '1d'] } }),
	      want: '1h/1d体力到达限制，退出等待重连'
		    },
	    {
	      name: 'offline reconnect churn summary is explicit',
	      got: offlineLeaveSummaryText('websocket reconnect churn', { reconnectChurn: { count: 3, windowMs: 10000 } }),
	      want: 'WebSocket 反复重连，退出等待重连'
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
	    }
		  ];
  const failed = cases.filter(item => item.got !== item.want);
  if (failed.length) {
    console.error(JSON.stringify({ ok: false, failed }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, cases: cases.length }, null, 2));
}

function getJson(url, timeoutMs = CDP_HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${err.message}\n${body.slice(0, 500)}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout fetching ${url}`)));
    req.on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('This script requires Node.js with global WebSocket support.');
    }
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { this.ws.close(); } catch (_) {}
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error(`CDP connect timeout: ${this.wsUrl}`)), 5000);
      this.ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = (event) => {
        fail(new Error(`CDP connect failed: ${event?.message || this.wsUrl}`));
      };
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve, reject, timer } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    if (this.ws) this.ws.close();
  }
}

async function findGamePage(cdpBase) {
  const pages = await getJson(`${cdpBase.replace(/\/$/, '')}/json/list`);
  const page = pages.find(item => item.type === 'page' && item.url.startsWith(GAME_ORIGIN));
  if (!page) {
    const summary = pages
      .filter(item => item.type === 'page')
      .map(item => `- ${item.title}: ${item.url}`)
      .join('\n');
    throw new Error(`Game page not found. Open ${GAME_ORIGIN} first.\nCurrent pages:\n${summary}`);
  }
  return page;
}

function browserBotSource(config) {
  return `
(() => {
		  const baseConfig = ${JSON.stringify(config)};
		  const runtimeConfig = (() => {
		    try {
		      return window.__graspRatBotRuntimeConfig && typeof window.__graspRatBotRuntimeConfig === 'object'
		        ? window.__graspRatBotRuntimeConfig
		        : {};
		    } catch (_) {
		      return {};
		    }
		  })();
		  const config = { ...baseConfig, ...runtimeConfig };
		  const BOT_KEY = '__graspRatBot';
		  const PANEL_ID = 'grasp-rat-bot-panel';
		  const TARGET_OVERLAY_ID = 'grasp-rat-target-overlay';
		  const PAUSED_KEY = 'graspRatBotPaused';
		  const PAUSE_REASON_KEY = 'graspRatBotPauseReason';
		  const LOGIN_SUPPRESS_KEY = 'graspRatLoginSuppressUntil';
		  const LOGIN_SUPPRESS_REASON_KEY = 'graspRatLoginSuppressReason';
	      const EXIT_AUDIT_PENDING_LOGS_KEY = 'graspRatExitAuditPendingLogs';
	      const ENEMY_LEAVE_STREAK_KEY = 'graspRatEnemyLeaveStreak';
	      const ENEMY_LEAVE_STATE_KEY = 'graspRatEnemyLeaveState';
	      const OFFLINE_LEAVE_STATE_KEY = 'graspRatOfflineLeaveState';
	      const CLOUDFLARE_RELOAD_KEY = 'graspRatCloudflareReloadAt';
		  const previousBot = window[BOT_KEY] || null;
	  const preserved = {
	    attackHistory: Array.isArray(previousBot?.attackHistory) ? previousBot.attackHistory.slice(-80) : [],
	    killHistory: Array.isArray(previousBot?.killHistory) ? previousBot.killHistory.slice(-40) : [],
	    seenKillKeys: Array.isArray(previousBot?.seenKillKeysList) ? previousBot.seenKillKeysList.slice(-120) : [],
	    session: previousBot?.session && typeof previousBot.session === 'object' ? { ...previousBot.session } : null,
	    combatTarget: previousBot?.combatTarget && typeof previousBot.combatTarget === 'object' ? { ...previousBot.combatTarget } : null,
	    combatAim: previousBot?.combatAim && typeof previousBot.combatAim === 'object' ? { ...previousBot.combatAim } : null,
	    opportunityChoice: previousBot?.opportunityChoice && typeof previousBot.opportunityChoice === 'object' ? { ...previousBot.opportunityChoice } : null,
	    pendingExit: previousBot?.pendingExit && typeof previousBot.pendingExit === 'object' ? { ...previousBot.pendingExit } : null,
	    lastLoginResult: previousBot?.lastLoginResult && typeof previousBot.lastLoginResult === 'object' ? { ...previousBot.lastLoginResult } : null,
		    lastManualLoginResult: previousBot?.lastManualLoginResult && typeof previousBot.lastManualLoginResult === 'object' ? { ...previousBot.lastManualLoginResult } : null,
		    exitAudit: previousBot?.exitAudit && typeof previousBot.exitAudit === 'object' ? { ...previousBot.exitAudit } : null,
		    loginSnapshotGate: previousBot?.loginSnapshotGate && typeof previousBot.loginSnapshotGate === 'object' ? { ...previousBot.loginSnapshotGate } : null,
		    leave403SnapshotRecovery: previousBot?.leave403SnapshotRecovery && typeof previousBot.leave403SnapshotRecovery === 'object' ? { ...previousBot.leave403SnapshotRecovery } : null,
	    postLoginZoom: previousBot?.postLoginZoom && typeof previousBot.postLoginZoom === 'object' ? { ...previousBot.postLoginZoom } : null,
	    combatLogging: previousBot?.combatLogging && typeof previousBot.combatLogging === 'object'
	      ? {
	        ...previousBot.combatLogging,
	        preBuffer: Array.isArray(previousBot.combatLogging.preBuffer) ? previousBot.combatLogging.preBuffer.slice(-160) : [],
	        pending: Array.isArray(previousBot.combatLogging.pending) ? previousBot.combatLogging.pending.slice(-1000) : []
	      }
	      : null,
	    coinFailures: previousBot?.coinFailures instanceof Map ? Array.from(previousBot.coinFailures.entries()).slice(-120) : []
	  };
	  const cfg = {
	    dryRun: Boolean(config.dryRun),
	    once: Boolean(config.once),
	    version: String(config.version || 'dev'),
	    sourceHash: String(config.sourceHash || ''),
	    sourceUrl: String(config.sourceUrl || ''),
	    injectedBy: String(config.injectedBy || 'cdp'),
    tickMs: 120,
    statusEvery: Math.max(250, Number(config.statusEvery) || 1000),
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
    panicRadius: 14500,
    passiveAvoidRadius: 11000,
    passivePanicRadius: 120,
    recoveryAvoidRadius: 22000,
    activeSpeedMin: 5,
    activeMoveMin: 120,
    activeSeenMs: 1800,
    attackRange: 14500,
    attackPreferredRange: 14500,
    attackEngageRange: 11000,
    attackApproachRange: 26000,
    attackDangerRadius: 25000,
    globalAttackMaxDistance: 26000,
    nativeEntityAuthoritativeRadius: 42000,
    nativeCoinAuthoritativeRadius: 50000,
    combatAttackRange: 14500,
    combatCriticalHpLeaveThreshold: 20,
    combatLowHpLeaveThreshold: 50,
    combatLowHpCloseRiskMargin: 5,
    combatHighHpDisadvantageGap: 20,
    combatLowHpNoDamageLeaveThreshold: 70,
    combatLowHpNoDamageLeaveMs: 15000,
    combatLowHpNoDamageMinGap: 0,
    combatShootEveryMs: 160,
    combatShootReserveMs: 5600,
    combatShootDodgeReserveMs: 3800,
    combatShootHighHpDodgeReserveMs: 3000,
    combatShootHighHpMinHp: 90,
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
    combatAimNoDamageMs: 1000,
    combatAimNoDamageStepMs: 800,
    combatAimNoDamageMaxRadians: 0.14,
    combatAimLockMs: 450,
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
    combatEngageGraceRange: 22000,
    combatSpacingMinRange: 4500,
    combatSpacingPreferredRange: 6500,
    combatSpacingEmergencyRange: 3000,
    combatSpacingLowHpThreshold: 70,
    combatPressureCloseNoDamageMs: 8000,
    combatPressureCloseRange: 6500,
    combatPressureCloseMinHp: 60,
    combatLeaveRetryMs: 1000,
    enemyReloginMinDelayMs: 60000,
    enemyReloginMaxDelayMs: 600000,
    enemyReloginJitterMs: 15000,
    enemyReloginRepeatResetMs: 7200000,
    enemyReloginRepeatSecondMaxMs: 1800000,
    enemyReloginRepeatThirdMaxMs: 3600000,
    unsafeExitReloginMinDelayMs: 60000,
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
			    opportunitySameCoinRadius: 1200,
			    opportunityNearbyPriorityDistance: 18000,
	    coinMaxDistance: 18000,
	    coinDangerRadius: 25000,
	    invulnerableActiveCoinDangerRadius: 36000,
	    invulnerableActiveCoinHeadingBlockRadius: 65000,
	    invulnerableActiveCoinHeadingLaneRadius: 18000,
	    invulnerableActiveCoinHeadingCosMin: 0.55,
	    invulnerableActiveCoinHeadingMinDistance: 1500,
	    stationaryActiveCoinDangerRadius: 12000,
    globalCoinMaxDistance: 22000,
    patrolCoinMaxDistance: 22000,
    scanCoinMaxDistance: 22000,
    distantCoinMaxDistance: 35000,
    distantCoinMinDistance: 22000,
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
	    snapshotCoinStaleMs: 30000,
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
    conserveCoinMaxDistance: 6000,
    recoveryCoinMaxDistance: 600,
    coinPrecisionTolerance: 60,
    coinPickupExactTolerance: 0,
    targetStickMs: 5000,
    coinStickMs: 2500,
    coinNoProgressMs: 18000,
    coinProgressMinGain: 250,
    coinIgnoreMs: 20000,
    coinCollectedIgnoreMs: 60000,
    coinCollectedConfirmDistance: 1800,
    coinCollectedPruneRadius: 900,
    coinNoProgressIgnoreMs: 45000,
    coinNearFailureIgnoreMs: 30000,
    coinCloseFailureIgnoreMs: 20000,
    coinNearStuckResetGain: 120,
    coinFailureMaxIgnoreMs: 1800000,
    coinFailureHardIgnoreCount: 3,
    coinFailureHardIgnoreMs: 900000,
    coinFailureSevereIgnoreCount: 5,
    coinFailureSevereIgnoreMs: 1800000,
    coinFailureDecayMs: 600000,
    closeCoinStuckDistance: 1200,
    closeCoinStuckMs: 12000,
    nearCoinStuckDistance: 5000,
    nearCoinStuckMs: 16000,
    staleCoinEscapeMs: 1800,
    coinApproachLockMs: 900,
    coinAxisFlipTolerance: 650,
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
    shootEveryMs: 120,
    opportunisticShootEveryMs: 120,
    opportunisticShotMinScoreRatio: 1,
    globalRefreshMs: 5000,
    nativeTickMinMs: 120,
    attackMinStamina: 0,
    conserveStaminaThreshold: 6500,
    lowHpThreshold: 60,
    recoverHpThreshold: 95,
    staminaFullRatio: 0.98,
    staminaExhaustedThresholdMs: 1000,
	    staminaResetGraceMs: 10000,
	    staminaBudgetReloginDelayMs: 300000,
	    loginSnapshotSuccessRequired: 3,
	    loginSnapshotProbeMinMs: 5000,
	    autoLogin: true,
	    loginCooldownMs: 5000,
    postLoginGraceMs: 45000,
    fleeLockMs: 1400,
	    pursuitLeaveMs: 300000,
	    pursuitLeaveNonFullHpMs: 90000,
	    pursuitLeaveInvulnerableMs: 60000,
	    pursuitLeaveNonFullHpInvulnerableMs: 45000,
	    pursuitLostGraceMs: 10000,
    pursuitLeaveRetryMs: 1000,
    pursuitTrackRadius: 42000,
    pursuitTowardCosMin: 0.25,
    pursuitClosingMinDistance: 250,
    offlineLeaveMs: 3000,
    offlineUnsafeLeaveMs: 0,
    offlineSafeLeaveMs: 3000,
	    offlineReconnectChurnWindowMs: 10000,
	    offlineReconnectChurnMinEvents: 3,
	    gameSessionNoSelfLeaveMs: 30000,
	    offlinePassiveDangerRadius: 2500,
    offlineLeaveRetryMs: 600,
    leaveRetryMinMs: 10000,
    leaveCommandTimeoutMs: 10000,
    leave403ReloginDelayMs: 3600000,
    leave403SnapshotSuccessRequired: 5,
    offlineLeaveCooldownMs: 60000,
    serverPositionStallEnabled: true,
    serverPositionStallOfflineEnabled: false,
    serverPositionStallMs: 2500,
    serverPositionNoMoveStallMs: 0,
    serverPositionStallHoldMs: 6000,
    serverPositionCommandFreshMs: 900,
    serverPositionSnapshotMaxAgeMs: 2500,
    serverPositionClientMoveMin: 300,
    serverPositionServerMoveMax: 80,
    serverPositionGapMin: 400,
    sessionResetMissingMs: 10000,
	    reloadAfterNoSelfMs: 45000,
	    reloadAfterOfflineMs: 20000,
	    cloudflareErrorReloadMs: 5000,
	    page403ErrorReloadMs: 600000,
	    globalRefreshTimeoutMs: 1500,
	    combatLoggingEnabled: Boolean(config.combatLoggingEnabled),
	    combatLogEndpoint: String(config.combatLogEndpoint || 'http://127.0.0.1:18765/combat-log'),
	    combatLogPreBufferMs: 10000,
	    combatLogPostBufferMs: 10000,
	    combatLogFlushMs: 1000,
	    combatLogBatchMaxEntries: 50,
	    combatLogMaxPendingEntries: 1000,
	    combatLogMaxBulletEntries: 24,
		    combatLogMaxEntityEntries: 12,
    postLoginZoomOutClicks: 4,
    postLoginZoomStartDelayMs: 350,
    postLoginZoomOutIntervalMs: 80,
    postLoginZoomArmMissingMs: 1000,
	    status: '',
    ...config,
    // The page owns the game WebSocket lifecycle; the bot must not reconnect or create a second socket.
    allowNativeReconnect: false,
    allowBotWebSocketFallback: false
  };

	  function readPersistentExitState(key, t = Date.now()) {
	    let state = null;
	    try {
	      state = JSON.parse(localStorage.getItem(key) || 'null');
	    } catch (_) {
	      state = null;
	    }
	    if (!state || typeof state !== 'object') return null;
	    const reloginUntil = Number(state.reloginUntil || 0);
	    if (reloginUntil && reloginUntil <= t) {
	      clearPersistentExitState(key);
	      return null;
	    }
	    return refreshExitDetail({ ...state, restored: true }, t);
	  }

	  function writePersistentExitState(key, detail) {
	    if (!detail || typeof detail !== 'object') return;
	    const t = Date.now();
	    const reloginUntil = Number(detail.reloginUntil || 0);
	    if (reloginUntil && reloginUntil <= t) {
	      clearPersistentExitState(key);
	      return;
	    }
	    const state = refreshExitDetail({
	      at: Number(detail.at || t),
	      updatedAt: t,
	      attempted: Boolean(detail.attempted),
	      method: detail.method || '',
	      error: detail.error || '',
	      reason: detail.reason || '',
	      summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
	      reloginUntil,
	      reloginDelayMs: Number(detail.reloginDelayMs || 0),
	      reloginHpDelayMs: Number(detail.reloginHpDelayMs || 0),
	      reloginDelayRangeMs: detail.reloginDelayRangeMs || null,
	      reloginRepeatDelayMs: Number(detail.reloginRepeatDelayMs || 0),
	      reloginRepeatCount: Number(detail.reloginRepeatCount || 0),
	      reloginMinimumDelayMs: Number(detail.reloginMinimumDelayMs || 0),
	      reloginMinimumReason: detail.reloginMinimumReason || '',
	      enemyActor: detail.enemyActor || null,
	      enemyLeaveStreak: detail.enemyLeaveStreak || null,
	      enemyLeaveReason: detail.enemyLeaveReason || '',
	      loginSuppressReason: detail.loginSuppressReason || '',
	      target: detail.target || null,
	      pursuit: detail.pursuit || null,
	      injury: detail.injury || null,
	      self: detail.self || null,
	      offlineSafety: detail.offlineSafety || null,
	      staminaReset: detail.staminaReset || null
	    }, t);
	    try {
	      localStorage.setItem(key, JSON.stringify(state));
	    } catch (_) {}
	  }

	  function clearPersistentExitState(key) {
	    try {
	      localStorage.removeItem(key);
	    } catch (_) {}
	  }

	  function refreshExitDetail(detail, t = Date.now()) {
	    if (!detail || typeof detail !== 'object') return detail;
	    const reloginUntil = Number(detail.reloginUntil || 0);
	    if (reloginUntil) detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - t));
	    if (detail.offlineSafety?.staminaBudgetExit) {
	      detail.summary = offlineLeaveSummary(detail.reason || 'stamina budget coin leave', detail.offlineSafety);
	    } else if (detail.offlineSafety?.staminaExhausted) {
	      detail.summary = offlineLeaveSummary(detail.reason || 'stamina exhausted', detail.offlineSafety);
	    }
	    return finalizeLeaveDisplayReason(detail);
	  }

	  function restoredCoinFailures() {
    const t = performance.now();
    return (preserved.coinFailures || []).map(([id, item]) => {
      const next = { ...(item || {}) };
      const count = Number(next.count || 0);
      const lastAt = Number(next.lastAt || 0);
      const staleFailure = lastAt && t - lastAt > cfg.coinFailureDecayMs;
      let ignoreUntil = Number(next.ignoreUntil || 0);
      if ((next.reason === 'near' || next.reason === 'close') && count <= 1) {
        return null;
      }
      if (!staleFailure) {
        if (count >= cfg.coinFailureSevereIgnoreCount) {
          ignoreUntil = Math.max(ignoreUntil, t + cfg.coinFailureSevereIgnoreMs);
        } else if (count >= cfg.coinFailureHardIgnoreCount) {
          ignoreUntil = Math.max(ignoreUntil, t + cfg.coinFailureHardIgnoreMs);
        }
      }
      next.ignoreUntil = ignoreUntil;
      return [String(id), next];
    }).filter(Boolean);
  }

		  const restoredFailures = restoredCoinFailures();
		  const restoredEnemyLeaveState = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
		  const restoredOfflineLeaveState = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);

		  function loginSnapshotSuccessRequired() {
		    const raw = Number(cfg.loginSnapshotSuccessRequired ?? 3);
		    return Math.max(0, Math.round(Number.isFinite(raw) ? raw : 3));
		  }

		  function normalizeLoginSnapshotGateState(state = null) {
		    const required = loginSnapshotSuccessRequired();
		    return {
		      streak: Math.max(0, Math.round(Number(state?.streak || 0) || 0)),
		      required,
		      lastOkAt: Number(state?.lastOkAt || 0) || 0,
		      lastErrorAt: Number(state?.lastErrorAt || 0) || 0,
		      lastSampleAt: Number(state?.lastSampleAt || state?.lastOkAt || state?.lastErrorAt || 0) || 0,
		      lastError: String(state?.lastError || ''),
		      lastTick: Number(state?.lastTick || 0) || 0,
		      resetAt: Number(state?.resetAt || 0) || 0,
		      resetReason: String(state?.resetReason || '')
		    };
		  }

		  const bot = {
	    running: true,
	    version: cfg.version,
	    sourceHash: cfg.sourceHash,
	    sourceUrl: cfg.sourceUrl,
	    injectedBy: cfg.injectedBy,
	    startedAt: Date.now(),
    lastTickAt: 0,
    lastStatusAt: 0,
	    lastShotAt: 0,
	    lastAction: null,
	    waitSince: 0,
	    offlineSince: 0,
	    lastLoginAt: 0,
	    lastLoginResult: preserved.lastLoginResult,
	    lastManualLoginResult: preserved.lastManualLoginResult,
	    pendingExit: preserved.pendingExit,
	    lastOfflineLeaveAt: 0,
		    lastOfflineLeaveResult: restoredOfflineLeaveState,
	    offlineReloginUntil: Math.max(0, Number(restoredOfflineLeaveState?.reloginUntil || 0)),
	    lastOfflineLeaveWaitMs: Number(restoredOfflineLeaveState?.reloginDelayMs || restoredOfflineLeaveState?.holdRemainingMs || 0),
    lastOfflineSafety: null,
    serverPositionStall: null,
    lastPursuitLeaveAt: 0,
    lastPursuitLeaveResult: null,
    lastCombatLeaveAt: 0,
    lastCombatLeaveResult: null,
    pendingCombatLeave: null,
	    lastInjuryLeaveAt: 0,
	    lastInjuryLeaveResult: null,
	    pendingInjuryLeave: null,
	    lastEnemyLeaveResult: restoredEnemyLeaveState,
	    lastEnemyLeaveWaitMs: Number(restoredEnemyLeaveState?.reloginDelayMs || restoredEnemyLeaveState?.holdRemainingMs || 0),
	    lastEnemyLeaveRetryAt: 0,
    lastEnemyLeaveRetryResult: null,
	    pursuitReloginUntil: Math.max(0, Number(restoredEnemyLeaveState?.reloginUntil || 0)),
    enemyLeaveStreak: null,
    pursuit: null,
    combatStrafe: null,
    combatTarget: preserved.combatTarget,
    combatAim: preserved.combatAim,
    combatLogging: {
      enabled: Boolean(cfg.combatLoggingEnabled),
      endpoint: String(cfg.combatLogEndpoint || 'http://127.0.0.1:18765/combat-log'),
      combatId: String(preserved.combatLogging?.combatId || ''),
      active: Boolean(preserved.combatLogging?.active),
      startedAt: Number(preserved.combatLogging?.startedAt || 0),
      lastCombatAt: Number(preserved.combatLogging?.lastCombatAt || 0),
      lastFlushAt: 0,
      preBuffer: Array.isArray(preserved.combatLogging?.preBuffer) ? preserved.combatLogging.preBuffer : [],
      pending: Array.isArray(preserved.combatLogging?.pending) ? preserved.combatLogging.pending : [],
      dropped: Number(preserved.combatLogging?.dropped || 0),
      sent: Number(preserved.combatLogging?.sent || 0),
      failed: Number(preserved.combatLogging?.failed || 0),
      sending: false,
      sendingExitAuditIds: [],
      pendingExitAuditIds: [],
      lastError: String(preserved.combatLogging?.lastError || ''),
      lastOkAt: Number(preserved.combatLogging?.lastOkAt || 0),
      sequence: Number(preserved.combatLogging?.sequence || 0)
	    },
	    exitAudit: {
	      sequence: Number(preserved.exitAudit?.sequence || previousBot?.exitAudit?.sequence || 0),
	      requestSequence: Number(preserved.exitAudit?.requestSequence || previousBot?.exitAudit?.requestSequence || 0),
	      restored: 0,
	      lastBlockedReload: null,
	      lastBlockedLogin: null,
	      lastEvent: null
	    },
	    loginSnapshotGate: normalizeLoginSnapshotGateState(preserved.loginSnapshotGate),
	    leave403SnapshotRecovery: {
      streak: Math.max(0, Number(preserved.leave403SnapshotRecovery?.streak || 0) || 0),
      required: Math.max(1, Math.round(Number(cfg.leave403SnapshotSuccessRequired || 5) || 5)),
      lastOkAt: Number(preserved.leave403SnapshotRecovery?.lastOkAt || 0) || 0,
      lastErrorAt: Number(preserved.leave403SnapshotRecovery?.lastErrorAt || 0) || 0,
      lastError: String(preserved.leave403SnapshotRecovery?.lastError || ''),
      clearedAt: Number(preserved.leave403SnapshotRecovery?.clearedAt || 0) || 0,
      clearedReason: String(preserved.leave403SnapshotRecovery?.clearedReason || '')
    },
    postLoginZoom: {
      armed: preserved.postLoginZoom ? Boolean(preserved.postLoginZoom.armed) : true,
      missingSince: Number(preserved.postLoginZoom?.missingSince || 0) || 0,
      generation: Number(preserved.postLoginZoom?.generation || 0) || 0,
      appliedKey: String(preserved.postLoginZoom?.appliedKey || ''),
      scheduledKey: String(preserved.postLoginZoom?.scheduledKey || ''),
      scheduledAt: Number(preserved.postLoginZoom?.scheduledAt || 0) || 0,
      lastSeenSelfAt: Number(preserved.postLoginZoom?.lastSeenSelfAt || 0) || 0,
      lastResult: preserved.postLoginZoom?.lastResult && typeof preserved.postLoginZoom.lastResult === 'object'
        ? { ...preserved.postLoginZoom.lastResult }
        : null
    },
	    reloadRequestedAt: 0,
    lastTarget: null,
	    lastTargetAt: 0,
	    snapshotCoinWaitSince: Number(previousBot?.snapshotCoinWaitSince || 0) || 0,
	    lastSnapshotCoinWaitAgeMs: Number(previousBot?.lastSnapshotCoinWaitAgeMs || 0) || 0,
	    lastCoinSourceSummary: previousBot?.lastCoinSourceSummary || null,
	    lastSelf: null,
		    lastSafety: null,
		    actionThreats: [],
		    opportunityChoice: preserved.opportunityChoice,
		    returnBlockLock: null,
    returnBlockScan: null,
    returnBlockCooldownUntil: 0,
    returnBlockRecentThreatId: '',
    fleeLock: null,
    patrolHeading: null,
    velocityStopTimer: 0,
    velocityPulseToken: 0,
    coinApproachLock: null,
    staleCoinEscape: null,
    coinProgress: null,
    lastCoinCollected: null,
    coinAttempts: new Map(),
    ignoredCoins: new Map(restoredFailures
      .filter(([, item]) => Number(item?.ignoreUntil || 0) > performance.now())
      .map(([id, item]) => [String(id), Number(item.ignoreUntil)])),
    coinFailures: new Map(restoredFailures),
    nativeMessageWs: null,
    nativeMessageHandler: null,
    nativeOpenHandler: null,
    nativeCloseHandler: null,
    nativeErrorHandler: null,
    lastNativeTickAt: 0,
    seenEntities: new Map(),
    session: {
      startedAt: Number(preserved.session?.startedAt || 0) || 0,
      userId: preserved.session?.userId ?? null,
      baseCoins: Number.isFinite(Number(preserved.session?.baseCoins)) ? Number(preserved.session.baseCoins) : null,
      coinsGained: Math.max(0, Number(preserved.session?.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(preserved.session?.coinPickupTotal || 0) || 0),
      coinPickupKeys: Array.isArray(preserved.session?.coinPickupKeys) ? preserved.session.coinPickupKeys.slice(-80) : [],
      kills: Math.max(0, Number(preserved.session?.kills || 0) || 0),
      stamina1dSpentBeforeSegment: Math.max(0, Number(preserved.session?.stamina1dSpentBeforeSegment || 0) || 0),
      stamina1dSpentMs: Math.max(0, Number(preserved.session?.stamina1dSpentMs || 0) || 0),
      stamina1dSegmentStartedAt: Number(preserved.session?.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dSegmentBase: Number.isFinite(Number(preserved.session?.stamina1dSegmentBase)) ? Number(preserved.session.stamina1dSegmentBase) : null,
      stamina1dLastRemaining: Number.isFinite(Number(preserved.session?.stamina1dLastRemaining)) ? Number(preserved.session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(preserved.session?.stamina1dLastLimit)) ? Number(preserved.session.stamina1dLastLimit) : null,
      combatLogSentBase: Number.isFinite(Number(preserved.session?.combatLogSentBase)) ? Number(preserved.session.combatLogSentBase) : null,
      combatLogFailedBase: Number.isFinite(Number(preserved.session?.combatLogFailedBase)) ? Number(preserved.session.combatLogFailedBase) : null,
      missingSince: Number(preserved.session?.missingSince || 0) || 0
    },
	    globalState: { refreshedAt: 0, snapshotRefreshedAt: 0, tick: 0, entities: [], bullets: [], coinDrops: [], messages: [], minimap: null, error: '' },
	    control: {
	      ws: null,
	      wsOpen: false,
	      wsReadyState: null,
	      wsUrl: '',
	      currentUserId: 0,
	      hasToken: false,
	      connecting: false,
	      transport: '',
	      nativeWsOpen: false,
	      nativeWsReadyState: null,
	      nativeReconnectEvents: [],
	      nativeReconnectChurn: false,
	      nativeReconnectEventCount: 0,
	      nativeReconnectWindowMs: 0,
	      lastOpenAt: 0,
	      lastMessageAt: 0,
	      lastError: '',
	      lastVelocity: '',
	      lastVelocityAt: 0,
	      nonZeroVelocitySince: 0,
	      lastNonZeroVelocityAt: 0
	    },
    attackHistory: preserved.attackHistory,
    killHistory: preserved.killHistory,
    seenKillKeys: new Set(preserved.seenKillKeys),
    seenKillKeysList: preserved.seenKillKeys,
	    tickCount: 0,
	    starting: true,
	    ticking: false,
	    lastDecision: null,
	    errors: [],
	    lastDebugAt: 0,
	    stopReason: '',
	    paused: Boolean(config.paused || window.__graspRatBotPaused),
	    pauseReason: '',
	    pauseChangedAt: 0,
	    stop(reason = 'manual') {
	      this.running = false;
	      this.stopReason = reason;
	      if (this.velocityStopTimer) clearTimeout(this.velocityStopTimer);
	      this.velocityStopTimer = 0;
	      this.velocityPulseToken += 1;
	      stopMotionSafely('stop');
	      detachNativeMessagePump();
	      closeControlWs(reason);
	      if (this.timer) clearInterval(this.timer);
	      this.timer = 0;
	      try {
	        if (!String(reason || '').startsWith('replaced by ')) flushCombatLogs(true);
	      } catch (_) {}
	      logStatus('stopped: ' + reason);
	      if (window[BOT_KEY] === this) {
	        removeBotPanel();
	        removeTargetOverlay();
	      }
	    },
	    setPaused(paused, reason = 'external') {
	      const next = Boolean(paused);
	      const previousReason = this.pauseReason || '';
	      const changed = this.paused !== next;
	      this.paused = next;
	      this.pauseReason = next ? String(reason || 'manual') : '';
	      const reasonChanged = previousReason !== this.pauseReason;
	      if (changed) this.pauseChangedAt = Date.now();
	      window.__graspRatBotPaused = next;
	      window.__graspRatBotPauseReason = this.pauseReason;
	      try {
	        localStorage.setItem(PAUSED_KEY, next ? 'true' : 'false');
	        if (next) localStorage.setItem(PAUSE_REASON_KEY, this.pauseReason || 'manual');
	        else localStorage.removeItem(PAUSE_REASON_KEY);
	      } catch (_) {}
	      if (changed && next) {
	        stopMotionSafely('paused');
	      }
	      if (next) {
	        this.lastDecision = {
	          kind: 'idle',
	          reason: 'paused',
	          dx: 0,
	          dy: 0,
	          self: this.lastSelf,
	          paused: true,
	          pauseReason: this.pauseReason || 'manual'
	        };
	      }
	      return this.status();
	    },
	    forceLoginNow(reason = 'panel immediate login') {
	      return forceLoginNow(reason);
	    },
	    configureCombatLogging(options = {}) {
	      return configureCombatLogging(options);
	    },
	    step(source = 'external') {
	      return tick(source);
	    },
	    status() {
      try {
        if (!this.ticking) syncPausedFromPage(false);
      } catch (_) {}
      if (this.running && !this.ticking && this.lastTickAt && Date.now() - this.lastTickAt > Math.max(3000, cfg.tickMs * 10)) {
        triggerNativeTick('status-watchdog', false);
      }
      const self = getSelf();
      const currentSelfSummary = self ? summarizeSelf(self) : null;
      const displaySelf = currentSelfSummary || this.lastSelf;
      if (self) updateKillHistory(self);
	      updateSessionStats(currentSelfSummary);
	      const session = summarizeSessionStats(displaySelf);
	      const enemyLeaveDetail = activeEnemyLeaveDetail();
	      const offlineLeaveDetail = activeOfflineLeaveDetail();
		      return {
	        version: cfg.version,
	        sourceHash: cfg.sourceHash,
	        sourceUrl: cfg.sourceUrl,
	        injectedBy: cfg.injectedBy,
	        running: this.running,
	        paused: Boolean(this.paused),
	        pauseReason: this.pauseReason || '',
	        pauseChangedAt: this.pauseChangedAt || 0,
        ticking: Boolean(this.ticking),
        timerActive: Boolean(this.timer),
        dryRun: cfg.dryRun,
        starting: Boolean(this.starting),
        tickCount: this.tickCount,
        uptimeMs: Date.now() - this.startedAt,
        lastTickAt: this.lastTickAt,
        lastTickAgeMs: this.lastTickAt ? Date.now() - this.lastTickAt : null,
        lastNativeTickAgeMs: this.lastNativeTickAt ? now() - this.lastNativeTickAt : null,
        lastAction: this.lastAction,
	        lastDecision: this.lastDecision,
	        lastTarget: this.lastTarget,
	        combatTarget: this.combatTarget,
	        combatAim: this.combatAim,
		        combatLogging: summarizeCombatLoggingStatus(),
		        exitAudit: {
		          pending: unresolvedExitAuditLogCount(),
		          pendingIds: pendingExitAuditLogIds().slice(0, 12),
		          restored: Number(this.exitAudit?.restored || 0),
		          lastEvent: this.exitAudit?.lastEvent || null,
		          lastBlockedReload: this.exitAudit?.lastBlockedReload || null,
		          lastBlockedLogin: this.exitAudit?.lastBlockedLogin || null
		        },
		        opportunityChoice: this.opportunityChoice,
	        leave403SnapshotRecovery: this.leave403SnapshotRecovery,
	        loginSnapshotGate: snapshotLoginGateStatus(),
	        postLoginZoom: this.postLoginZoom,
		        self: displaySelf,
        session,
        safety: this.lastSafety,
        attackHistory: this.attackHistory.slice(-10),
        killHistory: this.killHistory.slice(-10),
        coinProgress: this.coinProgress,
        lastCoinCollected: this.lastCoinCollected,
        coinAttempts: Array.from(this.coinAttempts.values()).slice(-8).map(item => ({
          id: item.id,
          bestDistance: Math.round(item.bestDistance),
          lastDistance: Math.round(item.lastDistance),
          closeAgeMs: item.closeStartedAt ? Math.max(0, Math.round(now() - item.closeStartedAt)) : 0,
          lastSeenAgeMs: item.lastSeenAt ? Math.max(0, Math.round(now() - item.lastSeenAt)) : 0
        })),
        ignoredCoins: Array.from(this.ignoredCoins.entries()).map(([id, until]) => ({
          id,
          remainingMs: Math.max(0, Math.round(until - now()))
        })),
	        coinFailures: Array.from(this.coinFailures.entries()).slice(-8).map(([id, item]) => ({
	          id,
	          count: Number(item.count || 0),
	          reason: item.reason || '',
	          remainingMs: Math.max(0, Math.round(Number(item.ignoreUntil || 0) - now()))
	        })),
	        snapshotCoinWait: {
	          since: this.snapshotCoinWaitSince || 0,
	          ageMs: Math.max(0, Math.round(Number(this.lastSnapshotCoinWaitAgeMs || 0))),
	          maxMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0))),
	          remainingMs: Math.max(0, Math.round(Number(cfg.snapshotCoinIdleMaxMs || 0) - Number(this.lastSnapshotCoinWaitAgeMs || 0)))
	        },
	        coinSources: this.lastCoinSourceSummary,
			        globalState: {
			          refreshedAt: this.globalState.refreshedAt,
		          snapshotRefreshedAt: this.globalState.snapshotRefreshedAt,
		          snapshotAgeMs: this.globalState.snapshotRefreshedAt ? Date.now() - this.globalState.snapshotRefreshedAt : null,
		          tick: this.globalState.tick,
	          entities: arrayCount(this.globalState.entities),
	          bullets: arrayCount(this.globalState.bullets),
		          coinDrops: arrayCount(this.globalState.coinDrops),
		          minimapPoints: this.globalState.minimap?.points?.length || 0,
		          error: this.globalState.error,
		          loginSnapshotGate: snapshotLoginGateStatus()
		        },
        control: summarizeControl(),
        serverPositionStall: summarizeServerPositionStall(),
        login: {
          lastAt: this.lastLoginAt || 0,
          lastAgeMs: this.lastLoginAt ? Date.now() - this.lastLoginAt : null,
          lastResult: this.lastLoginResult
        },
        pendingExit: summarizePendingExit(this.pendingExit),
        offlineLeave: {
          lastAt: this.lastOfflineLeaveAt || 0,
          lastAgeMs: this.lastOfflineLeaveAt ? Date.now() - this.lastOfflineLeaveAt : null,
          holdUntil: this.offlineReloginUntil || 0,
          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.offlineReloginUntil || 0) - Date.now())),
          safety: this.lastOfflineSafety,
          summary: offlineLeaveDetail?.summary || '',
          displayReason: offlineLeaveDetail?.displayReason || '',
          lastWaitMs: this.lastOfflineLeaveWaitMs || offlineLeaveDetail?.reloginDelayMs || offlineLeaveDetail?.holdRemainingMs || 0,
          lastResult: this.lastOfflineLeaveResult
        },
        pursuit: summarizePursuit(this.pursuit),
	        pursuitLeave: {
	          lastAt: this.lastPursuitLeaveAt || 0,
	          lastAgeMs: this.lastPursuitLeaveAt ? Date.now() - this.lastPursuitLeaveAt : null,
		          holdUntil: this.pursuitReloginUntil || 0,
		          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
		          lastResult: this.lastPursuitLeaveResult
		        },
			        enemyLeave: {
			          holdUntil: this.pursuitReloginUntil || 0,
			          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
			          reason: enemyLeaveDetail?.reason || this.lastInjuryLeaveResult?.reason || this.lastPursuitLeaveResult?.reason || this.lastCombatLeaveResult?.reason || '',
	          summary: enemyLeaveDetail?.summary || latestEnemyLeaveSummary(),
	          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
	          streak: readEnemyLeaveStreak(),
	          lastWaitMs: this.lastEnemyLeaveWaitMs || enemyLeaveDetail?.reloginDelayMs || enemyLeaveDetail?.holdRemainingMs || 0,
	          enemyActor: enemyLeaveDetail?.enemyActor || null,
	          reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
			          lastInjuryResult: this.lastInjuryLeaveResult,
		          lastPursuitResult: this.lastPursuitLeaveResult,
		          lastCombatResult: this.lastCombatLeaveResult,
	          lastRetryResult: this.lastEnemyLeaveRetryResult
	        },
	        combatLeave: {
	          lastAt: this.lastCombatLeaveAt || 0,
	          lastAgeMs: this.lastCombatLeaveAt ? Date.now() - this.lastCombatLeaveAt : null,
	          lastResult: this.lastCombatLeaveResult,
	          pending: summarizePendingCombatLeave(this.pendingCombatLeave)
	        },
	        stopReason: this.stopReason,
	        errors: this.errors.slice(-5)
	      };
	    }
	  };

	  const hypot = Math.hypot;
  const now = () => performance.now();
  const dist = (a, b) => hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  const speed = e => hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isAlive = e => e && e.life !== 'Dead' && e.life !== 'WaitingRevive' && !e.waiting_revive;
  const dropValue = e => Number(e.death_reward_preview ?? e.death_drop_coins ?? e.drop ?? 0) || 0;
  const truthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';
  const isInvulnerable = e => Number(e?.invulnerable_remaining_ticks ?? e?.invincible_remaining_ticks ?? e?.invulnerability_remaining_ticks ?? e?.invulnerableTicks ?? 0) > 0
    || truthyFlag(e?.invulnerable)
    || truthyFlag(e?.is_invulnerable)
    || truthyFlag(e?.isInvulnerable)
    || truthyFlag(e?.immune)
    || truthyFlag(e?.is_immune);
  const isJoinModeActive = e => e?.current_join_mode === 'Active' || e?.mode === 'Active';
  const isInvulnerableActive = e => isJoinModeActive(e) && isInvulnerable(e);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaLimitValue = (e, windowName, fallback) => {
    const value = Number(e?.['stamina_' + windowName + '_limit_milli'] ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
  const isStaminaWindowExhausted = (e, windowName) => {
    const value = staminaRemaining(e, windowName);
    return value !== null && value < staminaExhaustedThreshold();
  };
  const combatMovementBlockedByStamina = self => isStaminaWindowExhausted(self, '5s');
  const hasLongWindowStamina = e => !isStaminaWindowExhausted(e, '1h') && !isStaminaWindowExhausted(e, '1d');
  const hasMoveStamina = e => Number(e?.stamina_5s_remaining_milli || 0) > 250 && hasLongWindowStamina(e);
  const hasAttackStamina = e => Number(e?.stamina_5s_remaining_milli || 0) >= cfg.attackMinStamina && hasLongWindowStamina(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isFiringEntity = e => truthyFlag(e?.shooting)
    || truthyFlag(e?.is_shooting)
    || truthyFlag(e?.isShooting)
    || truthyFlag(e?.firing)
    || truthyFlag(e?.is_firing)
    || truthyFlag(e?.attacking)
    || truthyFlag(e?.is_attacking);
  const isMovingThreat = e => speed(e) >= cfg.activeSpeedMin || Boolean(e.recentlyMoved);
  const isCurrentlyActive = e => isMovingThreat(e) || isFiringEntity(e) || (isJoinModeActive(e) && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const isRecoveryUnsafeHuman = e => isCurrentlyActive(e);
  const isAfkTarget = e => !isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e);
  const isAfkProfitTarget = e => isAfkTarget(e) || (isJoinModeActive(e) && !isCurrentlyActive(e) && !isMovingThreat(e) && !isFiringEntity(e));
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
  const hpValue = e => Number(e?.hp ?? 0) || 0;
  const combatHpValue = e => Number.isFinite(Number(e?.hp)) ? Number(e.hp) : 100;
  const knownHpValue = e => {
    if (e && Object.prototype.hasOwnProperty.call(e, 'knownHp')) {
      return Number.isFinite(Number(e.knownHp)) ? Number(e.knownHp) : null;
    }
    return e?.hp !== undefined && e?.hp !== null && Number.isFinite(Number(e.hp)) ? Number(e.hp) : null;
  };
  const maxHpValue = e => Number(e?.max_hp ?? e?.maxHp ?? 0) || 0;
  const isFullHp = self => {
    const hp = hpValue(self);
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hp >= maxHp;
    return hp >= 100;
  };
  const decorateActiveThreat = (self, e) => {
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
  const isRecovering = self => {
    if (!self) return false;
    const maxHp = maxHpValue(self);
    if (maxHp > 0) return hpValue(self) < maxHp;
    return hpValue(self) < cfg.recoverHpThreshold;
  };
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  function summarizeStamina(self) {
    const windows = [
      { key: '5s', fallback: 10000 },
      { key: '1h', fallback: 3000000 },
      { key: '1d', fallback: 20000000 }
    ];
    const thresholdMs = staminaExhaustedThreshold();
    const items = windows.map(item => {
      const remaining = staminaRemaining(self, item.key);
      const limit = staminaLimitValue(self, item.key, item.fallback);
      return {
        key: item.key,
        remaining,
        limit,
        exhausted: remaining !== null && remaining < thresholdMs
      };
    });
    const exhausted = items.filter(item => item.exhausted).map(item => item.key);
    const longExhausted = exhausted.filter(key => key === '1h' || key === '1d');
    const byKey = Object.fromEntries(items.map(item => [item.key, item]));
    return {
      thresholdMs,
      stamina5s: byKey['5s'].remaining,
      stamina5sLimit: byKey['5s'].limit,
      stamina1h: byKey['1h'].remaining,
      stamina1hLimit: byKey['1h'].limit,
      stamina1d: byKey['1d'].remaining,
      stamina1dLimit: byKey['1d'].limit,
      exhausted,
      longExhausted,
      movementBlocked: exhausted.length > 0,
      mustLeave: longExhausted.length > 0
    };
  }
  function dailyStaminaWindowStartAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const utc8OffsetMs = 8 * 60 * 60 * 1000;
    return Math.floor((t + utc8OffsetMs) / dayMs) * dayMs - utc8OffsetMs;
  }
  function nextDailyStaminaResetAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    return dailyStaminaWindowStartAt(t) + dayMs;
  }
  function staminaBudgetReloginDelayMs() {
    return Math.max(1000, Number(cfg.staminaBudgetReloginDelayMs || 300000));
  }
  function staminaResetHoldUntil(staminaState, t = Date.now()) {
    const exhausted = Array.isArray(staminaState?.longExhausted)
      ? staminaState.longExhausted
      : [];
    let until = 0;
    let resetAt = 0;
    let fixedDelayMs = 0;
    if (exhausted.includes('1h')) {
      fixedDelayMs = staminaBudgetReloginDelayMs();
      until = Math.max(until, t + fixedDelayMs);
    }
    if (exhausted.includes('1d')) {
      resetAt = nextDailyStaminaResetAt(t);
      until = Math.max(until, resetAt);
    }
    if (!until) return null;
    const graceMs = resetAt && until === resetAt ? Math.max(0, Number(cfg.staminaResetGraceMs || 0)) : 0;
    return {
      until: until + graceMs,
      resetAt,
      graceMs,
      fixedDelayMs: resetAt && resetAt >= t + fixedDelayMs ? 0 : fixedDelayMs,
      fixed: Boolean(fixedDelayMs && !(resetAt && resetAt >= t + fixedDelayMs)),
      exhausted
    };
  }
  const attackWorthTaking = (self, target) => {
    if (isWhitelistedTarget(target)) return false;
    const targetDrop = dropValue(target);
    if (isAfkProfitTarget(target)) return targetDrop >= Math.max(0, Number(cfg.attackMinAfkDrop ?? cfg.attackMinDrop));
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };

  function removeTargetOverlay() {
    const overlay = document.getElementById(TARGET_OVERLAY_ID);
    if (overlay) overlay.remove();
  }

  function targetOverlayStyle(decision) {
    const target = decision?.target || null;
    if (!target) return null;
    if (decision?.combat) return { stroke: 'rgba(248,113,113,.48)' };
    const coinLike = targetOverlayCoinLike(decision, target);
    if (coinLike) return { stroke: 'rgba(250,204,21,.44)' };
    const playerLike = targetOverlayPlayerLike(decision, target);
    if (playerLike) return { stroke: 'rgba(74,222,128,.44)' };
    return null;
  }

  function targetOverlayCoinLike(decision, target = decision?.target || null) {
    const kind = String(decision?.kind || '');
    return Boolean(target && (kind === 'coin' || kind === 'seek-coin'
      || (target.amount !== undefined && target.amount !== null && Number.isFinite(Number(target.amount)))));
  }

  function targetOverlayPlayerLike(decision, target = decision?.target || null) {
    const kind = String(decision?.kind || '');
    return Boolean(target && (decision?.combat
      || kind === 'attack'
      || kind === 'seek-enemy'
      || kind === 'seek-drop'
      || target.name
      || (target.drop !== undefined && target.drop !== null && Number.isFinite(Number(target.drop)))));
  }

  function ensureTargetOverlayCanvas(world, shell) {
    if (!world || !shell || !document.body) return null;
    const worldRect = world.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    if (!(worldRect.width > 0) || !(worldRect.height > 0) || !(shellRect.width > 0) || !(shellRect.height > 0)) return null;
    let overlay = document.getElementById(TARGET_OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.id = TARGET_OVERLAY_ID;
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (overlay.parentElement !== shell) shell.appendChild(overlay);
    const shellPosition = getComputedStyle(shell).position;
    if (!shellPosition || shellPosition === 'static') shell.style.position = 'relative';
    overlay.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'width:' + shellRect.width + 'px',
      'height:' + shellRect.height + 'px',
      'z-index:5',
      'pointer-events:none'
    ].join(';');
    const dpr = Math.max(1, Number(window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(shellRect.width * dpr));
    const height = Math.max(1, Math.round(shellRect.height * dpr));
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    return { overlay, width: shellRect.width, height: shellRect.height, dpr };
  }

  function currentViewRadiusCm() {
    const nativeState = getNativeState();
    const values = [
      nativeState?.viewRadiusCm,
      nativeState?.view_radius_cm,
      nativeState?.viewRadius,
      nativeState?.view_radius
    ];
    for (const value of values) {
      const radius = Number(value);
      if (Number.isFinite(radius) && radius > 0) return radius;
    }
    return 10000;
  }

  function targetOverlayPoint(point, self, view) {
    const targetPoint = targetOverlayWorldPoint(point);
    const selfPoint = targetOverlayWorldPoint(self);
    const x = Number(targetPoint?.x);
    const y = Number(targetPoint?.y);
    const selfX = Number(selfPoint?.x);
    const selfY = Number(selfPoint?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(selfX) || !Number.isFinite(selfY)) return null;
    const scale = Math.min(view.width, view.height) / (Math.max(1, currentViewRadiusCm()) * 2);
    return {
      x: view.width / 2 + (x - selfX) * scale,
      y: view.height / 2 + (y - selfY) * scale
    };
  }

  function targetOverlayWorldPoint(value) {
    if (!value || typeof value !== 'object') return null;
    const point = value.position || value.pos || value.point || value.coord || null;
    const x = firstFiniteNumber(
      value.x,
      value.pos_x,
      value.posX,
      value.world_x,
      value.worldX,
      value.coord_x,
      value.coordX,
      value.center_x,
      value.centerX,
      value.visual_x,
      value.visualX,
      value.render_x,
      value.renderX,
      point?.x
    );
    const y = firstFiniteNumber(
      value.y,
      value.pos_y,
      value.posY,
      value.world_y,
      value.worldY,
      value.coord_y,
      value.coordY,
      value.center_y,
      value.centerY,
      value.visual_y,
      value.visualY,
      value.render_y,
      value.renderY,
      point?.y
    );
    return Number.isFinite(x) && Number.isFinite(y) ? { ...value, x, y } : null;
  }

  function targetOverlayListFromValue(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Map || value instanceof Set) return Array.from(value.values());
    if (value && typeof value === 'object') {
      if (targetOverlayWorldPoint(value)) return [value];
      const values = Object.values(value);
      if (values.length && values.every(item => item && typeof item === 'object')) return values;
    }
    return [];
  }

  function targetOverlayCallList(label, fn, thisArg = null) {
    if (typeof fn !== 'function') return [];
    try {
      return targetOverlayListFromValue(fn.call(thisArg)).map(item => item && typeof item === 'object' ? { ...item, overlaySource: label } : item);
    } catch (_) {
      return [];
    }
  }

  function targetOverlayRenderEntities() {
    const win = typeof window === 'object' && window ? window : null;
    const nativeState = getNativeState();
    return [
      ...targetOverlayCallList('render', typeof getRenderEntities === 'function' ? getRenderEntities : win?.getRenderEntities, win),
      ...targetOverlayCallList('state.getRenderEntities()', nativeState?.getRenderEntities, nativeState),
      ...targetOverlayListFromValue(nativeState?.renderEntities).map(item => item && typeof item === 'object' ? { ...item, overlaySource: 'state.renderEntities' } : item),
      ...targetOverlayListFromValue(nativeState?.render_entities).map(item => item && typeof item === 'object' ? { ...item, overlaySource: 'state.render_entities' } : item)
    ].filter(Boolean);
  }

  function targetOverlayFindEntity(list, target) {
    if (!Array.isArray(list) || !list.length || !target) return null;
    const targetId = target?.id ?? target?.user_id ?? target?.userId;
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      const exact = list.find(entity => String(entity?.user_id ?? entity?.userId ?? entity?.id ?? '') === String(targetId));
      if (exact) return exact;
    }
    const name = String(target?.name || '');
    if (name) {
      const exactName = list.find(entity => String(entity?.name || '') === name);
      if (exactName) return exactName;
    }
    return null;
  }

  function targetOverlayVisualSelf() {
    const id = getCurrentUserId();
    if (id) {
      const renderSelf = targetOverlayFindEntity(targetOverlayRenderEntities(), { id });
      if (renderSelf) return targetOverlayWorldPoint(renderSelf) || renderSelf;
    }
    const nativeState = getNativeState();
    const visual = targetOverlayWorldPoint(nativeState?.localVisual)
      || targetOverlayWorldPoint(nativeState?.local_visual)
      || targetOverlayWorldPoint(nativeState?.visualSelf)
      || targetOverlayWorldPoint(nativeState?.visual_self);
    if (visual) return visual;
    return getSelf();
  }

  function targetOverlayResolvedCoin(target) {
    const nativeCoins = (getNativeCoinList() || [])
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean);
    if (!nativeCoins.length) return null;
    const targetId = target?.id ?? target?.drop_id ?? target?.dropId ?? target?.coin_id ?? target?.coinId;
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      const exact = nativeCoins.find(coin => String(coin.drop_id ?? coin.id ?? '') === String(targetId));
      if (exact) return exact;
    }
    const targetX = Number(target?.x);
    const targetY = Number(target?.y);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;
    const targetAmount = Number(target?.amount);
    const maxDistance = 1400;
    return nativeCoins
      .map(coin => ({
        coin,
        distance: dist({ x: targetX, y: targetY }, coin),
        amountMatches: !Number.isFinite(targetAmount) || Math.round(Number(coin.amount || 0)) === Math.round(targetAmount)
      }))
      .filter(item => item.amountMatches && item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)[0]?.coin || null;
  }

  function targetOverlayResolvedEntity(target) {
    const targetId = target?.id ?? target?.user_id ?? target?.userId;
    const name = String(target?.name || '');
    const renderEntity = targetOverlayFindEntity(targetOverlayRenderEntities(), target);
    if (renderEntity) return targetOverlayWorldPoint(renderEntity) || renderEntity;
    const entities = getNativeEntityList() || getEntities() || [];
    if (!Array.isArray(entities) || !entities.length) return null;
    if (targetId !== undefined && targetId !== null && targetId !== '') {
      const exact = entities.find(entity => String(entity.user_id ?? entity.id ?? '') === String(targetId));
      if (exact) return exact;
    }
    if (name) {
      const exactName = entities.find(entity => String(entity.name || '') === name);
      if (exactName) return exactName;
    }
    return null;
  }

  function targetOverlayResolvedTarget(decision) {
    const target = decision?.target || null;
    if (!target) return null;
    if (targetOverlayCoinLike(decision, target)) return targetOverlayResolvedCoin(target) || target;
    if (targetOverlayPlayerLike(decision, target)) return targetOverlayResolvedEntity(target) || target;
    return target;
  }

  function renderTargetOverlay(decision = bot.lastDecision) {
    try {
      const style = targetOverlayStyle(decision);
      const target = targetOverlayResolvedTarget(decision);
      const self = targetOverlayVisualSelf() || decision?.self || bot.lastSelf;
      if (!style || !target || !self) {
        const existing = document.getElementById(TARGET_OVERLAY_ID);
        if (existing) {
          const ctx = existing.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, existing.width, existing.height);
        }
        return;
      }
      const world = document.getElementById('world');
      const shell = world?.closest?.('.map-shell') || world?.parentElement || null;
      const view = ensureTargetOverlayCanvas(world, shell);
      if (!view) return;
      const ctx = view.overlay.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      const start = targetOverlayPoint(self, self, view);
      const end = targetOverlayPoint(target, self, view);
      if (!start || !end) return;
      ctx.save();
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    } catch (_) {}
  }

	  function ensureBotPanel() {
	    return null;
	    if (!document.body) return null;
	    let panel = document.getElementById(PANEL_ID);
	    if (panel) return panel;
	    panel = document.createElement('div');
	    panel.id = PANEL_ID;
	    panel.setAttribute('aria-live', 'polite');
	    panel.style.cssText = [
	      'position:fixed',
	      'right:12px',
	      'top:12px',
	      'z-index:2147483647',
	      'width:min(360px,calc(100vw - 24px))',
	      'max-width:360px',
	      'box-sizing:border-box',
	      'padding:10px 12px',
	      'border:1px solid rgba(148,163,184,.35)',
	      'border-radius:8px',
	      'background:rgba(15,23,42,.88)',
	      'color:#e5e7eb',
	      'font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif',
	      'box-shadow:0 10px 32px rgba(0,0,0,.38)',
	      'backdrop-filter:blur(8px)',
	      'pointer-events:none',
	      'white-space:normal'
	    ].join(';');
	    document.body.appendChild(panel);
	    return panel;
	  }

	  function removeBotPanel() {
	    return;
	    const panel = document.getElementById(PANEL_ID);
	    if (panel) panel.remove();
	  }

	  function escapeHtml(value) {
	    return String(value ?? '').replace(/[&<>"']/g, ch => ({
	      '&': '&amp;',
	      '<': '&lt;',
	      '>': '&gt;',
	      '"': '&quot;',
	      "'": '&#39;'
	    }[ch]));
	  }

	  function formatDistance(value) {
	    const n = Number(value);
	    if (!Number.isFinite(n)) return '-';
	    const meters = n / 100;
	    if (Math.abs(meters) < 10) return Number(meters.toFixed(1)) + '米';
	    return Math.round(meters) + '米';
	  }

  function formatStaminaDisplay(self) {
    if (!self) return '-';
    const stamina = self.stamina || {};
    const valueText = (remaining, limit) => {
      const r = Number(remaining);
      if (!Number.isFinite(r)) return '-';
      const l = Number(limit);
      return Math.floor(r / 1000) + '/' + (Number.isFinite(l) && l > 0 ? Math.floor(l / 1000) : '-');
    };
    const exhausted = Array.isArray(stamina.exhausted) ? stamina.exhausted : [];
    const suffix = exhausted.length ? ' !' + exhausted.join('/') : '';
    return '5s ' + valueText(stamina.stamina5s ?? self.stamina5s ?? self.stamina_5s_remaining_milli, stamina.stamina5sLimit ?? self.stamina5sLimit ?? self.stamina_5s_limit_milli)
      + ' 1h ' + valueText(stamina.stamina1h ?? self.stamina1h ?? self.stamina_1h_remaining_milli, stamina.stamina1hLimit ?? self.stamina1hLimit ?? self.stamina_1h_limit_milli)
      + ' 1d ' + valueText(stamina.stamina1d ?? self.stamina1d ?? self.stamina_1d_remaining_milli, stamina.stamina1dLimit ?? self.stamina1dLimit ?? self.stamina_1d_limit_milli)
      + suffix;
  }

	  function decisionReasonDetail(decision) {
	    return decision?.leave?.displayReason
	      || decision?.displayReason
	      || decision?.enemyLeave?.displayReason
	      || decision?.offlineLeave?.displayReason
      || decision?.leave?.summary
      || decision?.exitSummary
      || decision?.leave?.exitSummary
      || decision?.leave?.enemyLeaveSummary
      || decision?.leave?.enemyLeaveReason
	      || '';
	  }

	  function activeEnemyLeaveDetail(t = Date.now()) {
	    const current = latestEnemyLeaveResult();
	    const restored = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
	    const picked = current || restored || bot.lastEnemyLeaveResult || null;
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
	      if (bot.lastEnemyLeaveResult === picked) bot.lastEnemyLeaveResult = null;
	      return null;
	    }
	    bot.lastEnemyLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.pursuitReloginUntil = Math.max(Number(bot.pursuitReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function activeOfflineLeaveDetail(t = Date.now()) {
	    const picked = bot.lastOfflineLeaveResult || readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
	      if (bot.lastOfflineLeaveResult === picked) bot.lastOfflineLeaveResult = null;
	      return null;
	    }
	    bot.lastOfflineLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.offlineReloginUntil = Math.max(Number(bot.offlineReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function latestEnemyLeaveResult() {
	    const candidates = [
	      { at: Number(bot.lastEnemyLeaveResult?.at || 0), result: bot.lastEnemyLeaveResult },
	      { at: Number(bot.lastCombatLeaveResult?.at || bot.lastCombatLeaveAt || 0), result: bot.lastCombatLeaveResult },
	      { at: Number(bot.lastPursuitLeaveResult?.at || bot.lastPursuitLeaveAt || 0), result: bot.lastPursuitLeaveResult },
	      { at: Number(bot.lastInjuryLeaveResult?.at || bot.lastInjuryLeaveAt || 0), result: bot.lastInjuryLeaveResult }
    ].filter(item => item.result);
    return candidates.sort((a, b) => b.at - a.at)[0]?.result || null;
  }

  function latestEnemyLeaveSummary() {
    const result = latestEnemyLeaveResult();
    return result?.summary || result?.exitSummary || result?.enemyLeaveSummary || result?.displayReason || '';
  }

  function latestEnemyLeaveDisplayReason() {
    const result = latestEnemyLeaveResult();
    return result?.displayReason || result?.summary || result?.exitSummary || result?.enemyLeaveSummary || '';
  }

	  function actionText(decision) {
	    const kind = decision?.kind || 'wait';
	    const target = decision?.target || null;
	    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
    const detail = decisionReasonDetail(decision);
	    if (kind === 'coin') return '拾取金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
	    if (kind === 'seek-coin') return '前往金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
    if (kind === 'attack') return (decision?.combat ? '战斗 ' : '攻击 ') + (target?.name || ('#' + (target?.id ?? '-'))) + ' HP ' + (target?.hp ?? '-') + ' Drop ' + (target?.drop ?? '-');
	    if (kind === 'seek-enemy' || kind === 'seek-drop') return '前往目标 ' + (target?.name || ('#' + (target?.id ?? '-'))) + (target?.drop ? ' Drop ' + target.drop : '');
	    if (kind === 'flee') {
	      const threat = threats[0];
	      return '避险撤离' + (threat ? '：' + (threat.name || ('#' + threat.id)) + ' 距离 ' + formatDistance(threat.d ?? threat.distance) : '');
	    }
	    if (kind === 'recover') return '恢复体力/血量';
	    if (kind === 'patrol') {
	      if (target) return '巡航到' + (target.amount ? '金币' : '区域') + ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance);
	      return '巡航扫描';
	    }
	    if (kind === 'wait') return '等待：' + (detail || decision?.reason || '状态不足');
	    if (kind === 'leave') return '退出：' + (detail || decision?.reason || '状态不足');
	    if (kind === 'idle') return '待命';
	    return kind;
	  }

	  function reasonText(reason) {
	    const map = {
      'active-threat-before-bullet-range': 'Active 玩家进入危险圈',
	      'active-threat-caution-migration': 'Active 玩家进入预警圈',
	      'active-threat-return-block': '阻止回头靠近 Active 玩家',
	      'return-block-lateral-scan': 'Active 返程冷却：横向扫描',
      'passive-panic-distance': '玩家距离过近',
	      'recovery-avoid-humans': '回血时避开附近玩家',
	      'recovery-foot-coin': '回血时顺手拾取脚下金币',
	      'foot-coin-priority': '贴身金币优先拾取',
	      'foot-coin-before-active-caution': '预警区内只拾取贴身金币',
	      'near-coin-priority': '近处安全金币优先',
	      'near-coin-before-active-caution': '预警区内只拾取近处安全金币',
	      'safe-coin-before-drop-target': '安全金币优先于攻击',
	      'safe-global-coin-before-drop-target': '前往可见安全金币',
	      'safe-patrol-coin': '巡航拾取安全金币',
	      'safe-distant-coin': '前往远处安全金币',
	      'post-attack-drop-coin': '战斗后优先拾取掉落',
	      'best-opportunity-coin': '综合收益最高：拾取金币',
	      'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
		      'best-opportunity-drop-target': '综合收益最高：攻击 Drop 目标',
		      'best-opportunity-afk-drop-target': '综合收益最高：攻击挂机 Drop 目标',
			      'approach-profitable-drop-target': '综合收益最高：靠近高 Drop 目标',
	      'approach-afk-drop-target': '综合收益最高：靠近挂机 Drop 目标',
	      'opportunistic-afk-drop-shot': '顺手射击挂机 Drop 目标',
	      'migrate-to-known-field': '迁移到金币密集区域',
	      'scan-toward-distant-coin': '扫描远处金币',
		      'snapshot-coin-field': '快照金币区域导航',
		      'snapshot-coin-target': '快照金币导航',
			      'snapshot-coin-idle-timeout': '等待超时，前往远处快照金币',
			      'wait-for-stamina-budget': '长期体力预算不足',
			      'stamina-budget-coin-leave': '1h体力预算不足，退出等待恢复',
			      'stamina-budget-coin-leave-retry': '1h体力预算不足，重试退出',
			      'wait-for-snapshot-coin': '等待快照金币',
		      'login-suppressed': '等待重连',
		      'exit-log-flush-pending': '等待退出日志发送完成',
		      'maintain-safe-spacing': '避开附近玩家',
	      'ignore-stale-coin-no-progress': '金币长时间无进展，临时脱离',
	      'leave-stale-coin': '离开疑似卡住金币',
	      'wait-for-full-stamina-and-hp': '等待恢复到安全状态',
	      'conserve-stamina-before-chasing': '兼容旧状态：保存体力',
	      'save-stamina-for-profitable-coin': '兼容旧状态：等待目标',
	      'combat-attack': '战斗：节奏开火',
	      'combat-tangent-dodge': '战斗：切线规避并节奏开火',
	      'combat-stamina-hold': '战斗：短体力不足，停止移动并暂停开火',
	      'combat-stamina-conserve': '战斗：保留体力躲避，暂停开火',
	      'combat-burst-fire': '战斗：保留体力，降频开火',
	      'combat-pressure-close': '战斗：久攻未中，压近并节奏开火',
	      'combat-spacing': '战斗：保持安全间距并开火',
	      'combat-spacing-dodge': '战斗：规避贴近并开火',
	      'combat-critical-hp-leave': '战斗血量低于 20，立即退出',
	      'combat-low-hp-leave': '战斗低血劣势，立即退出',
	      'combat-low-hp-no-damage-leave': '战斗低血且久攻未中，立即退出',
	      'combat-hp-disadvantage-leave': '战斗血量差劣势，立即退出',
	      'combat-leave': '战斗劣势退出后等待',
	      'combat-leave-retry': '战斗退出失败，等待补发退出',
	      'control-ws-offline': 'WebSocket 离线',
	      'control-ws-offline-unsafe': 'WebSocket 离线且周围危险，立即退出',
			      'control-ws-offline-safe-wait': 'WebSocket 离线，安全区短暂等待重连',
			      'control-ws-reconnect-churn': 'WebSocket 反复重连，立即退出',
			      'control-ws-no-self-game-session': '已登录但自身实体不可见，立即退出',
			      'control-ws-server-position-stalled': '服务端位置停止，按 WebSocket 离线处理',
		      'control-stamina-exhausted': '长周期体力耗尽，按 WebSocket 离线处理',
		      'stamina-exhausted-leave': '长周期体力耗尽，正在退出',
	      'offline-leave': 'WebSocket 离线，正在退出',
	      'offline-leave-wait': 'WebSocket 离线退出后等待重连',
	      'pursuit-leave': '被同一玩家持续追击，退出等待',
	      'pursuit-leave-retry': '追击退出失败，等待补发退出',
	      'pursuit-leave-wait': '追击退出后等待重新登录',
		      'auto-login': '自动触发登录/加入',
		      'login-cooldown': '登录已触发，等待页面跳转',
		      'login-snapshot-gate': '等待snapshot连续成功',
		      'login-control-missing': '等待登录控件出现',
	      'game-session-connecting': '已登录，等待游戏连接/自身实体',
	      'no-self': '未读到自身实体',
	      'not-alive': '不在存活状态',
	      'bot-error': '脚本异常'
	    };
	    return map[reason] || reason || '-';
	  }

	  function updateBotPanel(decision = bot.lastDecision) {
	    renderTargetOverlay(decision);
	    return;
	    const panel = ensureBotPanel();
	    if (!panel) return;
	    const self = decision?.self || bot.lastSelf || null;
	    const hp = self?.hp ?? '-';
	    const staminaText = formatStaminaDisplay(self);
	    const selfDrop = self ? (self.drop ?? dropValue(self)) : '-';
	    const control = summarizeControl();
	    const safety = bot.lastSafety || {};
	    const nearestActive = safety.nearestActive
	      ? (safety.nearestActive.name || ('#' + safety.nearestActive.id)) + ' ' + formatDistance(safety.nearestActive.distance)
	      : '-';
	    const wsLabel = control.wsOpen ? 'online' : (control.connecting ? 'connecting' : 'offline');
	    const velocity = control.nativeCurrentVel || control.lastVelocity || '0 0';
	    const version = cfg.version || 'dev';
	    const sourceHash = cfg.sourceHash ? String(cfg.sourceHash).slice(0, 8) : '-';
	    const panelLines = [
	      '<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#f8fafc">BOT ' + escapeHtml(actionText(decision)) + '</div>',
	      '<div style="font-size:11px;margin:-2px 0 4px;color:#cbd5e1;word-break:break-all">远端 ' + escapeHtml(version) + ' / ' + escapeHtml(sourceHash) + '</div>',
	      '<div>原因：' + escapeHtml(decisionReasonDetail(decision) || reasonText(decision?.reason)) + '</div>',
	      '<div>HP ' + escapeHtml(hp) + ' / 体力 ' + escapeHtml(staminaText) + ' / Drop ' + escapeHtml(selfDrop || '-') + '</div>',
	      '<div>移动 ' + escapeHtml(decision?.dx ?? 0) + ',' + escapeHtml(decision?.dy ?? 0) + ' / 速度 ' + escapeHtml(velocity) + '</div>',
	      '<div>WS ' + escapeHtml(wsLabel) + ' / 最近 Active ' + escapeHtml(nearestActive) + '</div>'
	    ];
	    if (decision?.target) {
	      const target = decision.target;
	      panelLines.push('<div>目标：' + escapeHtml(target.name || ('#' + (target.id ?? '-'))) + ' 距离 ' + escapeHtml(formatDistance(target.distance)) + ' 金币 ' + escapeHtml(target.amount ?? '-') + ' Drop ' + escapeHtml(target.drop ?? '-') + '</div>');
	    }
    if (decision?.combat) {
      panelLines.push('<div>战斗：瞄准 ' + escapeHtml(decision?.aimTarget?.mode || '-') + ' / 来弹 ' + escapeHtml(decision?.incomingBullet ? formatDistance(decision.incomingBullet.laneDistance) : '-') + '</div>');
    }
    if (decision?.opportunisticShot) {
      const shot = decision.opportunisticShot;
      panelLines.push('<div>顺手射击：' + escapeHtml(shot.name || ('#' + (shot.id ?? '-'))) + ' 距离 ' + escapeHtml(formatDistance(shot.distance)) + ' Drop ' + escapeHtml(shot.drop ?? '-') + '</div>');
    }
	    const pursuit = decision?.pursuit || safety.pursuit || summarizePursuit(bot.pursuit);
	    if (pursuit) {
	      panelLines.push('<div>追击：' + escapeHtml(pursuit.name || ('#' + pursuit.id)) + ' ' + escapeHtml(formatDistance(pursuit.distance)) + ' / ' + escapeHtml(Math.round((pursuit.durationMs || 0) / 1000)) + 's</div>');
	    }
	    if (Array.isArray(bot.errors) && bot.errors.length) {
	      panelLines.push('<div style="color:#fca5a5">错误：' + escapeHtml(bot.errors[bot.errors.length - 1]?.message || '') + '</div>');
	    }
	    panel.innerHTML = panelLines.join('');
	  }

			  function logStatus(text, detail) {
			    bot.lastAction = text;
			    if (detail) bot.lastDecision = detail;
			    if (bot.running) updateBotPanel(bot.lastDecision || detail || { kind: 'wait', reason: text, self: bot.lastSelf });
			    if (typeof log === 'function') log('[bot] ' + text, 'info');
			    console.log('[grasp-rat-bot]', text, detail || '');
			  }

      function safeStringify(value) {
        const seen = new WeakSet();
        try {
          const text = JSON.stringify(value, function (_key, item) {
            if (typeof item === 'bigint') return String(item);
            if (item && typeof item === 'object') {
              if (seen.has(item)) return '[Circular]';
              seen.add(item);
            }
            return item;
          });
          return String(text || '');
        } catch (err) {
          try {
            return JSON.stringify({ error: err?.message || String(err) });
          } catch (_) {
            return '{"error":"stringify failed"}';
          }
        }
      }

      function arrayCount(value) {
        return Array.isArray(value) ? value.length : 0;
      }

      function safeJsonClone(value) {
        try {
          return JSON.parse(safeStringify(value));
        } catch (_) {
          return null;
        }
      }

      function sanitizeCombatLogIdPart(value, fallback = 'unknown') {
        const text = String(value || fallback)
          .replace(/[^\w.-]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 80);
        return text || fallback;
      }

      function configureCombatLogging(options = {}) {
        const next = options && typeof options === 'object' ? options : {};
        if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
          cfg.combatLoggingEnabled = Boolean(next.enabled);
          bot.combatLogging.enabled = Boolean(next.enabled);
        }
        if (Object.prototype.hasOwnProperty.call(next, 'endpoint')) {
          const endpoint = String(next.endpoint || 'http://127.0.0.1:18765/combat-log');
          cfg.combatLogEndpoint = endpoint;
          bot.combatLogging.endpoint = endpoint;
        }
        if (!bot.combatLogging.enabled) {
          bot.combatLogging.active = false;
          bot.combatLogging.combatId = '';
        }
        return summarizeCombatLoggingStatus();
      }

      function summarizeCombatLoggingStatus() {
        const state = bot.combatLogging || {};
        const t = Date.now();
        const exitAuditPending = unresolvedExitAuditLogCount();
        return {
          enabled: Boolean(state.enabled),
          endpoint: String(state.endpoint || ''),
          active: Boolean(state.active),
          combatId: state.combatId || '',
          startedAt: Number(state.startedAt || 0),
          activeAgeMs: state.startedAt ? Math.max(0, Math.round(t - Number(state.startedAt || t))) : 0,
          lastCombatAgeMs: state.lastCombatAt ? Math.max(0, Math.round(t - Number(state.lastCombatAt || t))) : null,
          pending: Array.isArray(state.pending) ? state.pending.length : 0,
          preBuffer: Array.isArray(state.preBuffer) ? state.preBuffer.length : 0,
          exitAuditPending,
          exitAuditBlocking: exitAuditPending > 0,
          dropped: Number(state.dropped || 0),
          sent: Number(state.sent || 0),
	          failed: Number(state.failed || 0),
	          sending: Boolean(state.sending),
	          lastError: state.lastError || '',
	          lastSkipReason: state.lastSkipReason || '',
	          lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null
	        };
	      }

      function readPersistedExitAuditLogs() {
        try {
          const raw = localStorage.getItem(EXIT_AUDIT_PENDING_LOGS_KEY) || '[]';
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
        } catch (_) {
          return [];
        }
      }

      function writePersistedExitAuditLogs(entries) {
        try {
          const list = Array.isArray(entries) ? entries.filter(item => item && typeof item === 'object') : [];
          localStorage.setItem(EXIT_AUDIT_PENDING_LOGS_KEY, safeStringify(list.slice(-250)));
        } catch (_) {}
      }

      function persistExitAuditLogEntry(entry) {
        if (!entry?.exitAuditLogId) return;
        const existing = readPersistedExitAuditLogs();
        if (!existing.some(item => item.exitAuditLogId === entry.exitAuditLogId)) {
          existing.push(safeJsonClone(entry) || entry);
          writePersistedExitAuditLogs(existing);
        }
      }

      function removePersistedExitAuditLogs(ids) {
        const idSet = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
        if (!idSet.size) return;
        const remaining = readPersistedExitAuditLogs().filter(item => !idSet.has(item.exitAuditLogId));
        writePersistedExitAuditLogs(remaining);
      }

      function pendingExitAuditLogIds() {
        const state = bot.combatLogging || {};
        const ids = new Set();
        for (const entry of Array.isArray(state.pending) ? state.pending : []) {
          if (entry?.exitAuditLogId) ids.add(entry.exitAuditLogId);
        }
        for (const id of Array.isArray(state.pendingExitAuditIds) ? state.pendingExitAuditIds : []) {
          if (id) ids.add(id);
        }
        for (const id of Array.isArray(state.sendingExitAuditIds) ? state.sendingExitAuditIds : []) {
          if (id) ids.add(id);
        }
        for (const entry of readPersistedExitAuditLogs()) {
          if (entry?.exitAuditLogId) ids.add(entry.exitAuditLogId);
        }
        return Array.from(ids);
      }

      function unresolvedExitAuditLogCount() {
        return pendingExitAuditLogIds().length;
      }

      function exitAuditFlushPending() {
        return unresolvedExitAuditLogCount() > 0;
      }

      function exitAuditFlushBlockDetail(reason) {
        const state = bot.combatLogging || {};
        return {
          blocked: true,
          reason: String(reason || ''),
          pending: unresolvedExitAuditLogCount(),
          pendingIds: pendingExitAuditLogIds().slice(0, 12),
          sending: Boolean(state.sending),
          endpoint: String(state.endpoint || cfg.combatLogEndpoint || ''),
          lastError: state.lastError || '',
          lastOkAt: Number(state.lastOkAt || 0)
        };
      }

      function restorePersistedExitAuditLogs() {
        const state = bot.combatLogging;
        if (!state || !state.endpoint) return 0;
        if (!Array.isArray(state.pending)) state.pending = [];
        const restored = readPersistedExitAuditLogs();
        let added = 0;
        const existing = new Set(state.pending.map(entry => entry?.exitAuditLogId).filter(Boolean));
        for (const entry of restored) {
          if (!entry?.exitAuditLogId || existing.has(entry.exitAuditLogId)) continue;
          state.pending.unshift(entry);
          existing.add(entry.exitAuditLogId);
          added += 1;
        }
        if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
        for (const entry of state.pending) {
          if (entry?.exitAuditLogId && !state.pendingExitAuditIds.includes(entry.exitAuditLogId)) {
            state.pendingExitAuditIds.push(entry.exitAuditLogId);
          }
        }
        bot.exitAudit.restored = added;
        if (added) flushCombatLogs(true);
        return added;
      }

      function newExitAuditId(source, reason) {
        bot.exitAudit.sequence = Number(bot.exitAudit.sequence || 0) + 1;
        const clean = String(source || 'exit').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'exit';
        const why = String(reason || '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'reason';
        return clean + '-' + Date.now().toString(36) + '-' + bot.exitAudit.sequence + '-' + why;
      }

      function newExitAuditRequestId(exitAuditId) {
        bot.exitAudit.requestSequence = Number(bot.exitAudit.requestSequence || 0) + 1;
        return String(exitAuditId || 'exit') + '-req-' + bot.exitAudit.requestSequence;
      }

      function ensureExitAuditDetail(detail, meta = {}) {
        if (!detail || typeof detail !== 'object') return null;
        const source = String(meta.source || detail.exitAuditSource || detail.source || detail.reason || 'exit');
        const reason = String(meta.reason || detail.reason || '');
        if (!detail.exitAuditId) detail.exitAuditId = newExitAuditId(source, reason);
        if (!detail.exitTriggeredAt) detail.exitTriggeredAt = Number(detail.at || Date.now());
        detail.exitAuditSource = source;
        detail.exitAuditScope = meta.scope || detail.exitAuditScope || '';
        return detail.exitAuditId;
      }

      function exitAuditSelfSummary(selfLike) {
        return combatLogSelfSummary(selfLike || bot.lastSelf || null);
      }

      function recordExitAuditEvent(kind, detail = {}, extra = {}) {
        const state = bot.combatLogging;
        if (!state || !state.endpoint) return false;
        const auditId = ensureExitAuditDetail(detail, extra);
        const t = Number(extra.at || Date.now());
        const entry = {
          type: 'exit-audit',
          auditKind: kind,
          exitAuditId: auditId,
          exitAuditLogId: String(auditId || 'exit') + ':' + kind + ':' + t + ':' + (Number(bot.exitAudit.requestSequence || 0) || 0),
          at: t,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          url: location.href,
          visibilityState: document.visibilityState || '',
          scope: extra.scope || detail.exitAuditScope || '',
          source: extra.source || detail.exitAuditSource || '',
          reason: extra.reason || detail.reason || '',
          summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
          displayReason: detail.displayReason || '',
          triggeredAt: Number(detail.exitTriggeredAt || detail.at || t),
          confirmedAt: Number(extra.confirmedAt || detail.exitConfirmedAt || 0),
          successDurationMs: extra.confirmedAt || detail.exitConfirmedAt
            ? Math.max(0, Math.round(Number(extra.confirmedAt || detail.exitConfirmedAt) - Number(detail.exitTriggeredAt || detail.at || t)))
            : 0,
          currentUserId: getCurrentUserId() || null,
          self: exitAuditSelfSummary(extra.self || detail.self || detail.injury?.self || null),
          target: detail.target || extra.target || null,
          injury: detail.injury || extra.injury || null,
          pursuit: detail.pursuit || extra.pursuit || null,
          combat: detail.combat || extra.combat || null,
          offlineSafety: detail.offlineSafety || extra.offlineSafety || null,
	          pendingExit: summarizePendingExit(bot.pendingExit),
	          loginSnapshotGate: snapshotLoginGateStatus(),
	          request: extra.request || null,
          leave: {
            attempted: Boolean(detail.attempted),
            method: detail.method || '',
            error: detail.error || '',
            exitPending: Boolean(detail.exitPending),
            exitConfirmed: Boolean(detail.exitConfirmed),
            pendingLoginSuppressUntil: detail.pendingLoginSuppressUntil || 0,
            pendingLoginSuppressDelayMs: detail.pendingLoginSuppressDelayMs || 0,
            pendingLoginSuppressReason: detail.pendingLoginSuppressReason || '',
            reloginUntil: detail.reloginUntil || 0,
            reloginDelayMs: detail.reloginDelayMs || 0,
            holdRemainingMs: detail.holdRemainingMs || 0
          },
          confirmation: extra.confirmation || detail.exitConfirmation || null,
          control: summarizeControl(),
          globalState: combatLogGlobalStateSummary()
        };
        bot.exitAudit.lastEvent = {
          kind,
          exitAuditId: auditId,
          at: t,
          reason: entry.reason,
          error: entry.leave.error
        };
        const queued = queueCombatLogEntry(entry, { critical: true });
        if (queued) flushCombatLogs(true);
        return queued;
      }

      function combatLogSelfSummary(selfLike) {
        if (!selfLike) return null;
        if (selfLike.stamina || Object.prototype.hasOwnProperty.call(selfLike, 'coins')) {
          const clone = safeJsonClone(selfLike);
          if (clone) return clone;
        }
        try {
          return summarizeSelf(selfLike);
        } catch (_) {
          return {
            id: selfLike.user_id ?? selfLike.id ?? null,
            name: selfLike.name || '',
            x: Math.round(Number(selfLike.x) || 0),
            y: Math.round(Number(selfLike.y) || 0),
            hp: selfLike.hp ?? null,
            drop: Number(selfLike.drop ?? dropValue(selfLike) ?? 0) || 0,
            life: selfLike.life || '',
            mode: selfLike.current_join_mode || selfLike.mode || ''
          };
        }
      }

      function combatEntitySummary(entity, selfLike = null) {
        if (!entity) return null;
        const distance = Number.isFinite(Number(entity.distance))
          ? Number(entity.distance)
          : (selfLike && Number.isFinite(Number(selfLike.x)) && Number.isFinite(Number(selfLike.y)) ? dist(selfLike, entity) : NaN);
        return {
          id: entity.user_id ?? entity.id ?? null,
          name: entity.name || '',
          x: Math.round(Number(entity.x) || 0),
          y: Math.round(Number(entity.y) || 0),
          vx: Math.round(Number(entity.vx) || 0),
          vy: Math.round(Number(entity.vy) || 0),
          speed: Math.round(speed(entity)),
          distance: Number.isFinite(distance) ? Math.round(distance) : null,
          hp: Number.isFinite(Number(entity.hp)) ? Number(entity.hp) : null,
          knownHp: knownHpValue(entity),
          maxHp: Number(entity.max_hp ?? entity.maxHp ?? 0) || null,
          drop: Number(entity.drop ?? dropValue(entity) ?? 0) || 0,
          mode: entity.current_join_mode || entity.mode || '',
          life: entity.life || '',
          active: isCurrentlyActive(entity),
          moving: isMovingThreat(entity),
          firing: isFiringEntity(entity),
          invulnerable: isInvulnerable(entity),
          native: Boolean(entity.native),
          snapshot: Boolean(entity.snapshot),
          combatIntent: entity.combatIntent || '',
          recentlyMoved: Boolean(entity.recentlyMoved)
        };
      }

      function combatEntitySourceList() {
        const byId = new Map();
        const add = entity => {
          if (!entity || typeof entity !== 'object') return;
          const id = entity.user_id ?? entity.id;
          const key = id === undefined || id === null || id === ''
            ? 'xy:' + Math.round(Number(entity.x) || 0) + ':' + Math.round(Number(entity.y) || 0)
            : 'id:' + id;
          byId.set(key, { ...(byId.get(key) || {}), ...entity });
        };
        if (Array.isArray(bot.lastActionEntities)) {
          for (const entity of bot.lastActionEntities) add(entity);
        }
        let nativeEntities = [];
        try {
          nativeEntities = getNativeEntityList();
        } catch (_) {
          nativeEntities = [];
        }
        if (Array.isArray(nativeEntities)) {
          for (const entity of nativeEntities) add({ ...entity, native: true });
        }
        if (Array.isArray(bot.globalState.entities)) {
          for (const entity of bot.globalState.entities) add({ ...entity, snapshot: true });
        }
        return Array.from(byId.values());
      }

      function summarizeCombatEntities(selfLike, decision) {
        const limit = Math.max(1, Number(cfg.combatLogMaxEntityEntries) || 12);
        const targetId = decision?.target?.id ?? decision?.target?.user_id ?? null;
        return combatEntitySourceList()
          .filter(entity => {
            const id = entity.user_id ?? entity.id;
            const selfId = selfLike?.user_id ?? selfLike?.id;
            return id === undefined || id === null || String(id) !== String(selfId);
          })
          .map(entity => combatEntitySummary(entity, selfLike))
          .filter(Boolean)
          .sort((a, b) => {
            const aTarget = targetId !== null && targetId !== undefined && String(a.id) === String(targetId);
            const bTarget = targetId !== null && targetId !== undefined && String(b.id) === String(targetId);
            if (aTarget !== bTarget) return aTarget ? -1 : 1;
            if (a.active !== b.active) return a.active ? -1 : 1;
            const ad = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Infinity;
            const bd = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Infinity;
            return ad - bd;
          })
          .slice(0, limit);
      }

      function combatBulletSummary(raw, selfLike = null) {
        const bullet = normalizeBullet(raw, raw?.native ? 'native' : 'snapshot');
        if (!bullet) return null;
        const speedValue = hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
        let distance = NaN;
        let projection = null;
        let laneDistance = null;
        let signedLaneDistance = null;
        let timeToImpactMs = null;
        if (selfLike && Number.isFinite(Number(selfLike.x)) && Number.isFinite(Number(selfLike.y))) {
          const toSelfX = Number(selfLike.x) - Number(bullet.x);
          const toSelfY = Number(selfLike.y) - Number(bullet.y);
          distance = hypot(toSelfX, toSelfY);
          if (speedValue > 0.01) {
            projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
            signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
            laneDistance = Math.abs(signedLaneDistance);
            timeToImpactMs = projection > 0 ? projection / speedValue * 50 : null;
          }
        }
        return {
          id: bullet.id,
          ownerId: bullet.ownerId,
          x: Math.round(Number(bullet.x) || 0),
          y: Math.round(Number(bullet.y) || 0),
          vx: Math.round(Number(bullet.vx) || 0),
          vy: Math.round(Number(bullet.vy) || 0),
          speedPerTick: Math.round(Number(bullet.speedPerTick || speedValue || 0)),
          distance: Number.isFinite(distance) ? Math.round(distance) : null,
          projection: Number.isFinite(Number(projection)) ? Math.round(Number(projection)) : null,
          laneDistance: Number.isFinite(Number(laneDistance)) ? Math.round(Number(laneDistance)) : null,
          signedLaneDistance: Number.isFinite(Number(signedLaneDistance)) ? Math.round(Number(signedLaneDistance)) : null,
          timeToImpactMs: Number.isFinite(Number(timeToImpactMs)) ? Math.round(Number(timeToImpactMs)) : null,
          createdTick: bullet.createdTick,
          expireTick: bullet.expireTick,
          native: Boolean(bullet.native),
          snapshot: Boolean(bullet.snapshot)
        };
      }

      function summarizeCombatBullets(selfLike) {
        const limit = Math.max(1, Number(cfg.combatLogMaxBulletEntries) || 24);
        let bullets = [];
        try {
          bullets = getBullets();
        } catch (_) {
          bullets = Array.isArray(bot.globalState.bullets) ? bot.globalState.bullets : [];
        }
        return (bullets || [])
          .map(bullet => combatBulletSummary(bullet, selfLike))
          .filter(Boolean)
          .sort((a, b) => {
            const aThreat = Number.isFinite(Number(a.projection)) && Number(a.projection) > 0 && Number.isFinite(Number(a.laneDistance));
            const bThreat = Number.isFinite(Number(b.projection)) && Number(b.projection) > 0 && Number.isFinite(Number(b.laneDistance));
            if (aThreat !== bThreat) return aThreat ? -1 : 1;
            if (aThreat && bThreat && a.laneDistance !== b.laneDistance) return a.laneDistance - b.laneDistance;
            const ad = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Infinity;
            const bd = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Infinity;
            return ad - bd;
          })
          .slice(0, limit);
      }

      function combatLogGlobalStateSummary() {
        return {
          refreshedAt: bot.globalState.refreshedAt || 0,
          snapshotRefreshedAt: bot.globalState.snapshotRefreshedAt || 0,
          snapshotAgeMs: bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : null,
          tick: bot.globalState.tick,
          entities: arrayCount(bot.globalState.entities),
	          bullets: arrayCount(bot.globalState.bullets),
	          coinDrops: arrayCount(bot.globalState.coinDrops),
	          minimapPoints: bot.globalState.minimap?.points?.length || 0,
	          error: bot.globalState.error || '',
	          loginSnapshotGate: snapshotLoginGateStatus()
	        };
	      }

      function combatLogDecisionSummary(decision) {
        const cloned = safeJsonClone(decision || {});
        if (!cloned || typeof cloned !== 'object') return { reason: String(decision?.reason || '') };
        return cloned;
      }

      function combatLogEnemyExitSummary() {
        const detail = bot.lastEnemyLeaveResult || bot.lastCombatLeaveResult || bot.lastInjuryLeaveResult || bot.lastPursuitLeaveResult || null;
        if (!detail) return null;
        return {
          reason: detail.reason || '',
          summary: detail.summary || detail.exitSummary || detail.enemyLeaveSummary || '',
          displayReason: detail.displayReason || '',
          enemyActor: detail.enemyActor || null,
          target: detail.target || null,
          injury: detail.injury || null,
          pursuit: detail.pursuit || null,
          reloginUntil: detail.reloginUntil || 0,
          holdRemainingMs: detail.reloginUntil ? Math.max(0, Math.round(Number(detail.reloginUntil || 0) - Date.now())) : Number(detail.holdRemainingMs || 0),
          reloginDelayMs: detail.reloginDelayMs || 0,
          reloginRepeatCount: detail.reloginRepeatCount || detail.enemyLeaveStreak?.count || 0
        };
      }

      function combatLogLoginResultSummary(result) {
        if (!result || typeof result !== 'object') return null;
        return {
          at: result.at || 0,
          needed: Boolean(result.needed),
          attempted: Boolean(result.attempted),
          reason: result.reason || '',
          error: result.error || '',
          forced: Boolean(result.forced),
          method: result.method || '',
          cooldownRemainingMs: Number(result.cooldownRemainingMs || 0),
          suppressReason: result.suppressReason || '',
          ignoredSuppressMs: Number(result.ignoredSuppressMs || 0),
	          hasToken: Boolean(result.hasToken),
	          hasNativeSession: Boolean(result.hasNativeSession),
	          nativeWsReadyState: result.nativeWsReadyState ?? null,
	          loginRequired: Boolean(result.loginRequired),
	          currentUserId: result.currentUserId || null,
	          snapshotGate: result.snapshotGate || null
	        };
	      }

      function combatLogManualLoginSummary(result) {
        if (!result || typeof result !== 'object') return null;
        const cleared = result.cleared && typeof result.cleared === 'object' ? result.cleared : null;
        return {
          at: result.at || 0,
          reason: result.reason || '',
          cleared: cleared ? {
            reason: cleared.reason || '',
            suppressReason: cleared.suppressReason || '',
            suppressUntil: cleared.suppressUntil || 0,
            suppressRemainingMs: Number(cleared.suppressRemainingMs || 0),
            enemyHoldRemainingMs: Number(cleared.enemyHoldRemainingMs || 0),
            offlineHoldRemainingMs: Number(cleared.offlineHoldRemainingMs || 0)
          } : null,
          login: combatLogLoginResultSummary(result.login)
        };
      }

      function combatLogLoginSummary(decision) {
        let suppressUntil = 0;
        let suppressReason = '';
        try {
          suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
          suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
        } catch (_) {}
        const t = Date.now();
        return {
          suppressUntil,
          suppressRemainingMs: Math.max(0, Math.round(suppressUntil - t)),
          suppressReason,
          enemyHoldUntil: Number(bot.pursuitReloginUntil || 0),
          enemyHoldRemainingMs: enemyReloginHoldRemainingMs(),
	          offlineHoldUntil: Number(bot.offlineReloginUntil || 0),
	          offlineHoldRemainingMs: offlineReloginHoldRemainingMs(),
	          snapshotGate: snapshotLoginGateStatus(),
	          lastLoginAt: Number(bot.lastLoginAt || 0),
          lastLogin: combatLogLoginResultSummary(bot.lastLoginResult),
          decisionLogin: combatLogLoginResultSummary(decision?.login),
          manualLogin: combatLogManualLoginSummary(decision?.manualLogin || bot.lastManualLoginResult)
        };
      }

      const combatLogExitSummaryFromDecision = ${combatLogExitSummaryFromDecision.toString()};

      function combatLogExitSummary(decision) {
        return combatLogExitSummaryFromDecision(decision);
      }

      function buildCombatLogEntry(source, decision) {
        let currentSelf = null;
        try {
          currentSelf = getSelf();
        } catch (_) {
          currentSelf = null;
        }
        const rawSelf = currentSelf || decision?.self || bot.lastSelf || null;
        const self = combatLogSelfSummary(rawSelf);
        const nearbyEntities = summarizeCombatEntities(rawSelf || self, decision);
        const bullets = summarizeCombatBullets(rawSelf || self);
        let incoming = null;
        try {
          incoming = rawSelf ? incomingBulletThreat(rawSelf, null, getBullets()) : null;
        } catch (_) {
          incoming = null;
        }
        const exit = combatLogExitSummary(decision || {});
        const login = combatLogLoginSummary(decision || {});
        return {
          type: 'combat-frame',
          at: Date.now(),
          perfNow: Math.round(now()),
          tickCount: bot.tickCount,
          source,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          url: location.href,
          visibilityState: document.visibilityState || '',
          self,
          decision: combatLogDecisionSummary(decision),
          target: decision?.target || null,
          combatState: decision?.combatState || null,
          aimTarget: decision?.aimTarget || null,
          incomingBullet: decision?.incomingBullet || (incoming ? {
            id: incoming.id,
            ownerId: incoming.ownerId,
            distance: Math.round(Number(incoming.distance || 0)),
            laneDistance: Math.round(Number(incoming.laneDistance || 0)),
            signedLaneDistance: Number.isFinite(Number(incoming.signedLaneDistance)) ? Math.round(Number(incoming.signedLaneDistance)) : null,
            timeToImpactMs: Number.isFinite(Number(incoming.timeToImpactMs)) ? Math.round(Number(incoming.timeToImpactMs)) : null,
            reason: incoming.reason || 'incoming-bullet'
          } : null),
          injury: decision?.injury || bot.pendingInjuryLeave || null,
          pendingCombatLeave: summarizePendingCombatLeave(),
          pursuit: decision?.pursuit || summarizePursuit(bot.pursuit),
          safety: bot.lastSafety || null,
          combatTarget: bot.combatTarget || null,
          combatAim: bot.combatAim || null,
          control: summarizeControl(),
          globalState: combatLogGlobalStateSummary(),
          exit,
          login,
          enemyExit: combatLogEnemyExitSummary(),
          nearbyEntities,
          bullets
        };
      }

	      function combatLogTriggerReason(entry, decision) {
	        const reason = String(decision?.reason || '');
	        const target = decision?.target || entry?.target || null;
	        const afkTarget = combatLogIsAfkAttack(entry, decision);
	        if (decision?.combat && !afkTarget) return 'decision-combat';
	        if (/^combat-/.test(reason) && !afkTarget) return 'combat-reason';
	        if (decision?.pendingCombatLeave || entry.pendingCombatLeave) return 'pending-combat-leave';
	        if (decision?.injury || entry.injury) return 'injury';
	        if (entry.incomingBullet) return 'incoming-bullet';
	        if (/injury|pursuit-leave|incoming-bullet/.test(reason)) return reason || 'self-threat-reason';
	        return '';
	      }

	      function combatLogIsAfkAttack(entry, decision = entry?.decision || {}) {
	        const reason = String(decision?.reason || entry?.decision?.reason || '').toLowerCase();
	        const target = decision?.target || entry?.target || entry?.decision?.target || null;
	        const shot = decision?.opportunisticShot || entry?.decision?.opportunisticShot || null;
	        return Boolean(target?.afk)
	          || Boolean(shot)
	          || /afk/.test(reason)
	          || /挂机/.test(reason);
	      }

	      function combatLogSuspendReason(decision) {
	        const reason = String(decision?.reason || '');
	        if (!reason) return '';
		        if (/^(paused|cloudflare-error-refresh|no-self|not-alive|auto-login|manual-login|login-suppressed|login-cooldown|login-snapshot-gate|login-control-missing|game-session-connecting|exit-log-flush-pending)$/.test(reason)) return reason;
	        if (/^(enemy-leave-wait|pursuit-leave-wait|offline-leave-wait)$/.test(reason)) return reason;
		        if (/^(offline-leave|control-ws-offline|control-ws-offline-unsafe|control-ws-offline-safe-wait|control-ws-reconnect-churn|control-ws-no-self-game-session|control-ws-server-position-stalled|control-stamina-exhausted|stamina-exhausted-leave)$/.test(reason)) return reason;
	        return '';
	      }

      function combatLogTargetLabel(entry, decision) {
        const candidates = [
          decision?.target,
          entry?.target,
          entry?.enemyExit?.target,
          entry?.enemyExit?.enemyActor,
          entry?.injury?.nearestActive,
          entry?.injury?.nearestAvoidance,
          entry?.injury?.nearestHuman,
          entry?.pursuit,
          (entry?.nearbyEntities || [])[0]
        ];
        const picked = candidates.find(Boolean) || null;
        if (!picked) return 'unknown';
        return picked.name || picked.label || picked.id || picked.user_id || picked.targetId || 'unknown';
      }

      function makeCombatLogId(entry, decision) {
        const t = new Date(entry.at || Date.now()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
        const selfId = entry.self?.id ?? entry.self?.user_id ?? getCurrentUserId() ?? 'self';
        const target = combatLogTargetLabel(entry, decision);
        return sanitizeCombatLogIdPart(t + '-self-' + selfId + '-vs-' + target, 'combat-' + Date.now());
      }

	      function rememberCombatPreBuffer(entry) {
	        const state = bot.combatLogging;
	        if (combatLogIsAfkAttack(entry)) return;
	        if (!Array.isArray(state.preBuffer)) state.preBuffer = [];
	        const snapshot = safeJsonClone({ ...entry, phase: 'prebuffer' }) || { at: entry?.at || Date.now(), phase: 'prebuffer', error: 'clone failed' };
	        state.preBuffer.push(snapshot);
        const cutoff = Date.now() - Math.max(0, Number(cfg.combatLogPreBufferMs) || 10000);
        const maxEntries = Math.max(20, Math.ceil(Math.max(250, Number(cfg.combatLogPreBufferMs) || 10000) / Math.max(50, Number(cfg.tickMs) || 120)) + 10);
        while (state.preBuffer.length && Number(state.preBuffer[0].at || 0) < cutoff) state.preBuffer.shift();
        while (state.preBuffer.length > maxEntries) state.preBuffer.shift();
      }

      function queueCombatLogEntry(entry, options = {}) {
        const state = bot.combatLogging;
        const snapshot = safeJsonClone(entry) || { at: Date.now(), type: 'combat-log-clone-error', originalType: entry?.type || '' };
        const critical = Boolean(options.critical || snapshot.exitAuditLogId);
        if ((!state.enabled && !critical) || !state.endpoint) return false;
        if (!Array.isArray(state.pending)) state.pending = [];
        const queued = {
          ...snapshot,
          combatId: state.combatId || snapshot.combatId || entry.combatId || '',
          sequence: ++state.sequence,
          criticalLog: Boolean(snapshot.criticalLog || critical)
        };
        if (critical && !queued.exitAuditLogId) {
          queued.exitAuditLogId = 'critical:' + queued.type + ':' + queued.at + ':' + queued.sequence;
        }
        state.pending.push(queued);
        if (queued.exitAuditLogId) {
          if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
          if (!state.pendingExitAuditIds.includes(queued.exitAuditLogId)) state.pendingExitAuditIds.push(queued.exitAuditLogId);
          persistExitAuditLogEntry(queued);
        }
        const maxPending = Math.max(50, Number(cfg.combatLogMaxPendingEntries) || 1000);
        while (state.pending.length > maxPending) {
          const dropIndex = state.pending.findIndex(item => !item?.criticalLog && !item?.exitAuditLogId);
          if (dropIndex < 0) break;
          state.pending.splice(dropIndex, 1);
          state.dropped += 1;
        }
        return true;
      }

      function startCombatLogSession(entry, decision, triggerReason) {
        const state = bot.combatLogging;
        const prior = Array.isArray(state.preBuffer) ? state.preBuffer.slice() : [];
        state.active = true;
        state.startedAt = entry.at || Date.now();
        state.lastCombatAt = entry.at || Date.now();
        state.combatId = makeCombatLogId(entry, decision);
        state.sequence = 0;
        state.lastError = '';
        queueCombatLogEntry({
          type: 'combat-start',
          at: state.startedAt,
          triggerReason,
          source: entry.source,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          self: entry.self,
          target: entry.target || null,
          decision: entry.decision,
          login: entry.login || null,
          nearbyEntities: entry.nearbyEntities,
          exit: entry.exit || null,
          enemyExit: entry.enemyExit || null
	        });
	        for (const pre of prior) {
	          if (combatLogIsAfkAttack(pre)) continue;
	          queueCombatLogEntry({
	            ...pre,
	            type: 'combat-pre-frame',
            phase: 'pre'
          });
        }
      }

      function endCombatLogSession(entry, reason = 'post-buffer-elapsed') {
        const state = bot.combatLogging;
        queueCombatLogEntry({
          type: 'combat-end',
          at: entry?.at || Date.now(),
          reason,
          source: entry?.source || '',
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          injectedBy: cfg.injectedBy,
          self: entry?.self || null,
          decision: entry?.decision || null,
          login: entry?.login || null,
          exit: entry?.exit || null,
          enemyExit: entry?.enemyExit || null,
          sent: state.sent,
          dropped: state.dropped
        });
        state.active = false;
        state.combatId = '';
        state.startedAt = 0;
        state.lastCombatAt = 0;
      }

      function flushCombatLogs(force = false) {
        const state = bot.combatLogging;
        const hasCritical = Array.isArray(state?.pending) && state.pending.some(entry => entry?.criticalLog || entry?.exitAuditLogId);
        if ((!state?.enabled && !hasCritical) || !state.endpoint || state.sending) return false;
        if (!Array.isArray(state.pending) || !state.pending.length) return false;
        const t = Date.now();
        if (!force && t - Number(state.lastFlushAt || 0) < Math.max(250, Number(cfg.combatLogFlushMs) || 1000)) return false;
        if (typeof fetch !== 'function') {
          state.lastError = 'fetch unavailable';
          return false;
        }
        state.lastFlushAt = t;
        const batchSize = force
          ? Math.min(state.pending.length, Math.max(1, Number(cfg.combatLogBatchMaxEntries) || 50) * 4)
          : Math.max(1, Number(cfg.combatLogBatchMaxEntries) || 50);
        const entries = state.pending.splice(0, batchSize);
        const exitAuditIds = entries.map(entry => entry?.exitAuditLogId).filter(Boolean);
        if (exitAuditIds.length) {
          if (!Array.isArray(state.sendingExitAuditIds)) state.sendingExitAuditIds = [];
          for (const id of exitAuditIds) {
            if (!state.sendingExitAuditIds.includes(id)) state.sendingExitAuditIds.push(id);
          }
          if (Array.isArray(state.pendingExitAuditIds)) {
            state.pendingExitAuditIds = state.pendingExitAuditIds.filter(id => !exitAuditIds.includes(id));
          }
        }
        const payload = {
          combatId: entries[0]?.combatId || state.combatId || '',
          startedAt: state.startedAt || entries[0]?.at || t,
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          entries
        };
        state.sending = true;
        const body = safeStringify(payload);
        let sentOk = false;
        Promise.resolve()
          .then(() => fetch(state.endpoint, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-store',
            keepalive: body.length < 60000,
            headers: { 'content-type': 'application/json' },
            body
          }))
          .then(res => {
            if (!res || !res.ok) throw new Error('combat log POST failed: HTTP ' + (res?.status || 0));
            sentOk = true;
            state.sent += entries.length;
            state.lastOkAt = Date.now();
            state.lastError = '';
            if (exitAuditIds.length) removePersistedExitAuditLogs(exitAuditIds);
          })
          .catch(err => {
            state.failed += entries.length;
            state.lastError = err?.message || String(err);
            state.pending = entries.concat(Array.isArray(state.pending) ? state.pending : []);
            if (exitAuditIds.length) {
              if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
              for (const id of exitAuditIds) {
                if (!state.pendingExitAuditIds.includes(id)) state.pendingExitAuditIds.push(id);
              }
            }
            const maxPending = Math.max(50, Number(cfg.combatLogMaxPendingEntries) || 1000);
            while (state.pending.length > maxPending) {
              const dropIndex = state.pending.findIndex(item => !item?.criticalLog && !item?.exitAuditLogId);
              if (dropIndex < 0) break;
              state.pending.splice(dropIndex, 1);
              state.dropped += 1;
            }
          })
          .finally(() => {
            if (exitAuditIds.length && Array.isArray(state.sendingExitAuditIds)) {
              state.sendingExitAuditIds = state.sendingExitAuditIds.filter(id => !exitAuditIds.includes(id));
            }
            state.sending = false;
            if (sentOk && (force || state.pending.length >= Math.max(1, Number(cfg.combatLogBatchMaxEntries) || 50)) && state.pending.length) {
              flushCombatLogs(force);
            }
          });
        return true;
      }

	      function recordCombatLogTick(source, decision = bot.lastDecision) {
	        const state = bot.combatLogging;
	        if (!state?.enabled) return;
	        state.endpoint = String(cfg.combatLogEndpoint || state.endpoint || 'http://127.0.0.1:18765/combat-log');
	        if (!state.endpoint) return;
	        const suspendedReason = combatLogSuspendReason(decision || {});
	        if (suspendedReason) {
	          if (state.active) {
	            const entry = buildCombatLogEntry(source, decision || {});
	            endCombatLogSession(entry, 'suspended:' + suspendedReason);
	          }
		          state.lastSkipReason = suspendedReason;
		          return;
		        }
		        state.lastSkipReason = '';
		        const entry = buildCombatLogEntry(source, decision || {});
	        const triggerReason = combatLogTriggerReason(entry, decision || {});
	        const triggered = Boolean(triggerReason);
	        const afkFrame = combatLogIsAfkAttack(entry, decision || {});
	        if (afkFrame && !triggered) {
	          state.lastSkipReason = 'afk-attack';
	          if (state.active
	            && state.lastCombatAt
	            && entry.at - Number(state.lastCombatAt || 0) >= Math.max(0, Number(cfg.combatLogPostBufferMs) || 10000)) {
	            endCombatLogSession(entry, 'post-buffer-elapsed');
	          }
	          flushCombatLogs(false);
	          return;
	        }
        const priorActive = Boolean(state.active);
        if (triggered && !priorActive) {
          startCombatLogSession(entry, decision || {}, triggerReason);
        } else if (triggered) {
          state.lastCombatAt = entry.at;
        }
        rememberCombatPreBuffer(entry);
        if (state.active) {
          queueCombatLogEntry({
            ...entry,
            phase: triggered ? 'combat' : 'post',
            triggerReason: triggerReason || ''
          });
          if (!triggered && state.lastCombatAt && entry.at - Number(state.lastCombatAt || 0) >= Math.max(0, Number(cfg.combatLogPostBufferMs) || 10000)) {
            endCombatLogSession(entry);
          }
        }
        flushCombatLogs(false);
      }

      function recordUnhandledTickError(source, err) {
        const entry = {
          at: Date.now(),
          source,
          message: err?.message || String(err),
          stack: String(err?.stack || '')
        };
        try {
          if (!Array.isArray(bot.errors)) bot.errors = [];
          bot.errors.push(entry);
          if (bot.errors.length > 20) bot.errors.splice(0, bot.errors.length - 20);
        } catch (_) {}
        try {
          console.error('[grasp-rat-bot:unhandled-tick]', err);
        } catch (_) {}
        return entry;
      }

      function runTickSafely(source = 'timer') {
        return Promise.resolve()
          .then(() => tick(source))
          .catch(err => {
            recordUnhandledTickError(source, err);
          });
      }

      function runCallbackSafely(label, fn) {
        return function (...args) {
          try {
            const result = fn.apply(this, args);
            if (result && typeof result.then === 'function') {
              result.catch(err => recordUnhandledTickError(label, err));
            }
            return result;
          } catch (err) {
            recordUnhandledTickError(label, err);
            return undefined;
          }
        };
      }

		  function requestReload(reason) {
	    if (cfg.dryRun || cfg.once) return;
	    if (bot.reloadRequestedAt) return;
	    if (exitAuditFlushPending()) {
	      const blocked = exitAuditFlushBlockDetail('reload:' + (reason || ''));
	      bot.exitAudit.lastBlockedReload = blocked;
	      flushCombatLogs(true);
	      logStatus('reload blocked until exit audit logs flush: ' + (reason || ''), {
	        kind: 'wait',
	        reason: 'exit-log-flush-pending',
	        dx: 0,
	        dy: 0,
	        self: bot.lastSelf,
	        exitAuditFlush: blocked
	      });
	      return false;
	    }
	    bot.reloadRequestedAt = Date.now();
	    logStatus('reload: ' + reason);
	    location.reload();
	    return true;
	  }

	  function cloudflareErrorInfo() {
	    if (location.origin !== 'https://grasp-rat-game.h-e.top') return null;
	    const title = String(document.title || '');
	    const text = String(document.body?.innerText || '').slice(0, 5000);
	    const combined = title + '\\n' + text;
	    const isCloudflareError = /Error\\s*1033/i.test(combined)
	      || /Cloudflare\\s+Tunnel\\s+error/i.test(combined)
	      || (/Cloudflare/i.test(combined) && /unable\\s+to\\s+resolve/i.test(combined));
	    const isBunkerWebError = /BunkerWeb/i.test(combined)
	      && (/\\b403\\b/i.test(combined) || /Forbidden/i.test(combined) || /client-side\\s+error/i.test(combined) || /Access\\s+is\\s+forbidden/i.test(combined));
	    if (!isCloudflareError && !isBunkerWebError) return null;
	    const t = Date.now();
	    const provider = isBunkerWebError ? 'bunkerweb' : 'cloudflare';
	    const intervalMs = provider === 'bunkerweb'
	      ? Math.max(60000, Number(cfg.page403ErrorReloadMs) || 600000)
	      : Math.max(1000, Number(cfg.cloudflareErrorReloadMs) || 5000);
	    let lastReloadAt = 0;
	    try {
	      lastReloadAt = Number(localStorage.getItem(CLOUDFLARE_RELOAD_KEY) || 0) || 0;
	    } catch (_) {}
	    const elapsedMs = lastReloadAt ? t - lastReloadAt : intervalMs;
	    const remainingMs = Math.max(0, intervalMs - elapsedMs);
	    const code = /Error\\s*1033/i.test(combined) ? '1033' : (isBunkerWebError ? '403' : '');
	    const label = isBunkerWebError ? 'BunkerWeb 403 错误页' : (code ? 'Cloudflare Error ' + code : 'Cloudflare 错误页');
	    return {
	      error: true,
	      code,
	      label,
	      provider,
	      intervalMs,
	      lastReloadAt,
	      remainingMs,
	      displayReason: label + '，每' + formatDurationMs(intervalMs) + '刷新一次' + (remainingMs > 0 ? '，下次刷新剩余' + formatDurationMs(remainingMs) : '，正在刷新')
	    };
	  }

	  function maybeReloadCloudflareError(info) {
	    if (!info || cfg.dryRun || cfg.once) return false;
	    if (Number(info.remainingMs || 0) > 0) return false;
	    if (exitAuditFlushPending()) {
	      const blocked = exitAuditFlushBlockDetail('reload:cloudflare error');
	      bot.exitAudit.lastBlockedReload = blocked;
	      flushCombatLogs(true);
	      logStatus('reload blocked until exit audit logs flush: cloudflare error', {
	        kind: 'wait',
	        reason: 'exit-log-flush-pending',
	        dx: 0,
	        dy: 0,
	        self: bot.lastSelf,
	        cloudflare: info,
	        exitAuditFlush: blocked,
	        displayReason: '等待退出日志发送完成，暂不刷新错误页'
	      });
	      return false;
	    }
	    try {
	      localStorage.setItem(CLOUDFLARE_RELOAD_KEY, String(Date.now()));
	    } catch (_) {}
	    bot.cloudflareReloadAt = Date.now();
	    logStatus('reload: cloudflare error', { kind: 'wait', reason: 'cloudflare-error-refresh', cloudflare: info, displayReason: info.displayReason });
	    location.reload();
	    return true;
	  }

		  function getCurrentUserId() {
	    return Number(localStorage.getItem('tmpGameUserId') || document.getElementById('userId')?.value || bot.control.currentUserId || 0);
	  }

	  function getSessionToken() {
	    return localStorage.getItem('tmpGameSessionToken') || '';
	  }

  function wsReadyStateNumber(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function isWsConnectingOrOpen(value) {
    const n = wsReadyStateNumber(value);
    return n === 0 || n === 1;
  }

  function hasNativeGameSession(native = getNativeControl(), userId = getCurrentUserId()) {
    return Boolean(userId && native?.ws && (native.wsOpen || isWsConnectingOrOpen(native.wsReadyState)));
  }

	  function controlHasNativeGameSession(control) {
	    return Boolean(control?.currentUserId && (
	      control.rawWsOpen
	      || control.nativeWsOpen
	      || control.connecting
      || isWsConnectingOrOpen(control.nativeWsReadyState)
	      || isWsConnectingOrOpen(control.wsReadyState)
	    ));
	  }

	  function noSelfGameSessionExitState(control, noSelfAgeMs = 0) {
	    const userId = Number(control?.currentUserId || getCurrentUserId() || 0);
	    const loginRequired = Boolean(hasLoginRequiredText() || findLoginControl());
	    const hasSessionEvidence = Boolean(userId && !loginRequired && (
	      control?.hasToken
	      || controlHasNativeGameSession(control)
	      || control?.transport === 'native-page'
	      || Number.isFinite(wsReadyStateNumber(control?.nativeWsReadyState))
	      || Number.isFinite(wsReadyStateNumber(control?.wsReadyState))
	    ));
	    const reconnectChurn = Boolean(control?.nativeReconnectChurn);
	    const ageMs = Math.max(0, Math.round(Number(noSelfAgeMs || 0) || 0));
	    const leaveMs = Math.max(0, Number(cfg.gameSessionNoSelfLeaveMs || 0) || 0);
	    const timedOut = Boolean(leaveMs && ageMs >= leaveMs);
	    const wsOfflineish = Boolean(
	      !control?.wsOpen && (
	        control?.connecting
	        || isOfflineishWsReadyState(control?.nativeWsReadyState)
	        || isOfflineishWsReadyState(control?.wsReadyState)
	        || control?.rawWsOpen === false
	      )
	    );
	    const shouldLeave = Boolean(hasSessionEvidence && (reconnectChurn || timedOut));
	    const reason = reconnectChurn
	      ? 'websocket reconnect churn missing self'
	      : 'game session missing self';
	    return {
	      active: hasSessionEvidence,
	      shouldLeave,
	      reason,
	      displayReason: reconnectChurn
	        ? '已登录但自身实体不可见，WebSocket反复重连，正在退出'
	        : '已登录但自身实体长期不可见，正在退出',
	      userId: userId || null,
	      ageMs,
	      leaveMs,
	      timedOut,
	      reconnectChurn: reconnectChurn ? {
	        count: Number(control?.nativeReconnectEventCount || 0),
	        windowMs: Number(control?.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0)
	      } : null,
	      wsOfflineish,
	      loginRequired,
	      control: control ? {
	        wsOpen: Boolean(control.wsOpen),
	        rawWsOpen: Boolean(control.rawWsOpen),
	        connecting: Boolean(control.connecting),
	        wsReadyState: control.wsReadyState ?? null,
	        nativeWsReadyState: control.nativeWsReadyState ?? null,
	        hasToken: Boolean(control.hasToken),
	        transport: control.transport || ''
	      } : null
	    };
		  }

			  function isVisible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

	  function controlText(el) {
	    return (el?.innerText || el?.value || el?.getAttribute?.('aria-label') || el?.getAttribute?.('title') || '').trim();
	  }

  function describeControl(el) {
    if (!el) return '';
    if (el.id) return '#' + el.id;
    const text = controlText(el);
    if (text) return text;
    return String(el.tagName || '').toLowerCase();
  }

  function requestNativeViewportResize(reason = 'bot') {
    try {
      window.dispatchEvent(new Event('resize'));
      bot.lastNativeViewportResizeRequest = {
        at: Date.now(),
        reason: String(reason || 'bot')
      };
      return true;
    } catch (err) {
      bot.lastNativeViewportResizeRequest = {
        at: Date.now(),
        reason: String(reason || 'bot'),
        error: err?.message || String(err)
      };
      return false;
    }
  }

  function findZoomOutControl() {
    const direct = document.querySelector('#zoomOutBtn, [data-testid="zoom-out"], [aria-label="zoom out"], [aria-label="Zoom out"]');
    if (direct) return direct;
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]'));
    return candidates.find(el => {
      const text = controlText(el);
      return /zoom\s*out|缩小|缩放-|地图-|视图-/i.test(text);
    }) || null;
  }

  function clickZoomOutControl() {
    const control = findZoomOutControl();
    if (!control) return { clicked: false, error: 'zoom-out control not found' };
    if (control.disabled) return { clicked: false, error: 'zoom-out control disabled', control: describeControl(control) };
    try {
      control.click();
      return { clicked: true, control: describeControl(control) };
    } catch (err) {
      return { clicked: false, error: err?.message || String(err), control: describeControl(control) };
    }
  }

  function postLoginZoomSessionKey(selfSummary) {
    const userId = selfSummary?.user_id ?? getCurrentUserId() ?? '';
    const token = getSessionToken();
    if (token) return String(userId) + ':token:' + String(token).slice(0, 24);
    return String(userId) + ':generation:' + Number(bot.postLoginZoom?.generation || 0);
  }

  function noteSelfUnavailableForPostLoginZoom() {
    const state = bot.postLoginZoom;
    if (!state) return;
    const t = Date.now();
    if (!state.missingSince) state.missingSince = t;
    const missingMs = Math.max(0, t - Number(state.missingSince || t));
    if (missingMs < Math.max(0, Number(cfg.postLoginZoomArmMissingMs || 0))) return;
    if (!state.armed) {
      state.generation = Number(state.generation || 0) + 1;
      state.armed = true;
      state.scheduledKey = '';
    }
  }

  function schedulePostLoginZoomOut(selfSummary) {
    const state = bot.postLoginZoom;
    if (!state) return null;
    const t = Date.now();
    state.lastSeenSelfAt = t;
    state.missingSince = 0;
    const clicks = Math.max(0, Math.round(Number(cfg.postLoginZoomOutClicks || 0)));
    if (!clicks || !state.armed) return null;
    const key = postLoginZoomSessionKey(selfSummary);
    if (!key || state.appliedKey === key || state.scheduledKey === key) return null;
    state.armed = false;
    state.appliedKey = key;
    state.scheduledKey = key;
    state.scheduledAt = t;
    state.lastResult = {
      key,
      scheduledAt: t,
      startDelayMs: Math.max(0, Number(cfg.postLoginZoomStartDelayMs || 0) || 0),
      requestedClicks: clicks,
      completedClicks: 0,
      failedClicks: 0,
      lastError: ''
    };
    requestNativeViewportResize('post-login-zoom-schedule');
    setTimeout(() => requestNativeViewportResize('post-login-zoom-before-clicks'), state.lastResult.startDelayMs);
    const intervalMs = Math.max(0, Number(cfg.postLoginZoomOutIntervalMs || 0));
    for (let index = 0; index < clicks; index += 1) {
      setTimeout(() => {
        if (window[BOT_KEY] !== bot || !bot.running) return;
        requestNativeViewportResize('post-login-zoom-click-' + (index + 1));
        const result = clickZoomOutControl();
        const latest = state.lastResult || {};
        latest.completedClicks = Number(latest.completedClicks || 0) + (result.clicked ? 1 : 0);
        latest.failedClicks = Number(latest.failedClicks || 0) + (result.clicked ? 0 : 1);
        latest.lastError = result.error || '';
        latest.control = result.control || latest.control || '';
        latest.finishedAt = Date.now();
        state.lastResult = latest;
        requestNativeViewportResize('post-login-zoom-after-click-' + (index + 1));
      }, state.lastResult.startDelayMs + index * intervalMs);
    }
    return state.lastResult;
  }

	  function findLoginControl() {
    const direct = document.querySelector('#joinBtn, #loginBtn, [data-testid="login"], [data-testid="join"]');
    if (direct && isVisible(direct)) return direct;
    const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
      .filter(isVisible);
    return candidates.find(el => {
      const text = controlText(el);
      if (/leave|logout|sign out|cancel|退出|离开|取消/i.test(text)) return false;
      return /linuxdo|login|sign in|oauth|authorize|join|start|play|登录|登陆|授权|加入|进入|开始/i.test(text);
    }) || null;
  }

  function hasLoginRequiredText() {
    const text = (document.body?.innerText || '').slice(0, 5000);
    return /login required|please login|please sign in|not logged in|未登录|请先登录|请登录|需要登录/i.test(text);
  }

  function setLoginSuppress(reason, ms = cfg.postLoginGraceMs) {
    const requestedUntil = Date.now() + Math.max(1000, Number(ms) || cfg.postLoginGraceMs);
    let existingUntil = 0;
    let existingReason = '';
    try {
      existingUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      existingReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
    } catch (_) {}
    const reuseExisting = existingUntil > requestedUntil;
    const until = reuseExisting ? existingUntil : requestedUntil;
    const suppressReason = reuseExisting
      ? String(existingReason || reason || 'login flow')
      : String(reason || 'login flow');
    try {
      localStorage.setItem(LOGIN_SUPPRESS_KEY, String(until));
      localStorage.setItem(LOGIN_SUPPRESS_REASON_KEY, suppressReason);
    } catch (_) {}
    return until;
  }

	  function loginSuppressRemainingMs() {
	    let until = 0;
	    try {
	      until = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
	    } catch (_) {}
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && until) {
      try {
        localStorage.removeItem(LOGIN_SUPPRESS_KEY);
        localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      } catch (_) {}
	    }
	    return remaining;
	  }

	  function snapshotLoginGateStatus(t = Date.now()) {
	    const state = normalizeLoginSnapshotGateState(bot.loginSnapshotGate);
	    const required = loginSnapshotSuccessRequired();
	    state.required = required;
	    if (state.streak > required) state.streak = required;
	    const lastSampleAt = Number(state.lastSampleAt || state.lastOkAt || state.lastErrorAt || 0) || 0;
	    return {
	      ...state,
	      lastSampleAt,
	      satisfied: required <= 0 || state.streak >= required,
	      remaining: Math.max(0, required - state.streak),
	      lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null,
	      lastErrorAgeMs: state.lastErrorAt ? Math.max(0, Math.round(t - Number(state.lastErrorAt || t))) : null,
	      lastSampleAgeMs: lastSampleAt ? Math.max(0, Math.round(t - lastSampleAt)) : null
	    };
	  }

	  function resetLoginSnapshotGate(reason = 'exit') {
	    const t = Date.now();
	    bot.loginSnapshotGate = {
	      ...normalizeLoginSnapshotGateState(bot.loginSnapshotGate),
	      streak: 0,
	      required: loginSnapshotSuccessRequired(),
	      lastError: '',
	      resetAt: t,
	      resetReason: String(reason || 'exit')
	    };
	    return snapshotLoginGateStatus(t);
	  }

	  function noteLoginSnapshotProbe(success, detail = {}) {
	    const t = Date.now();
	    const required = loginSnapshotSuccessRequired();
	    const state = normalizeLoginSnapshotGateState(bot.loginSnapshotGate);
	    state.required = required;
	    state.lastSampleAt = t;
	    if (success) {
	      state.streak = Math.min(required, Math.max(0, Number(state.streak || 0)) + 1);
	      state.lastOkAt = t;
	      state.lastTick = Number(detail.tick || state.lastTick || 0) || 0;
	      state.lastError = '';
	    } else {
	      state.streak = 0;
	      state.lastErrorAt = t;
	      state.lastError = String(detail.error || detail.message || '');
	    }
	    bot.loginSnapshotGate = state;
	    return snapshotLoginGateStatus(t);
	  }

	  async function ensureLoginSnapshotGate(reason = 'login') {
	    let status = snapshotLoginGateStatus();
	    if (status.satisfied) return status;
	    const minProbeMs = Math.max(250, Number(cfg.loginSnapshotProbeMinMs ?? cfg.globalRefreshMs ?? 5000) || 5000);
	    const sampleAge = Number(status.lastSampleAgeMs ?? Infinity);
	    if (!Number.isFinite(sampleAge) || sampleAge >= minProbeMs) {
	      try {
	        await refreshGlobalState(true);
	      } catch (err) {
	        const message = err?.message || String(err);
	        bot.globalState.error = message;
	        noteLoginSnapshotProbe(false, { error: message });
	      }
	      status = snapshotLoginGateStatus();
	    }
	    status.blockReason = String(reason || 'login');
	    return status;
	  }

	  function loginSnapshotGateDisplayReason(snapshotGate = snapshotLoginGateStatus()) {
	    const gate = snapshotGate || snapshotLoginGateStatus();
	    if (gate.satisfied) return '';
	    const pieces = [
	      '等待snapshot连续成功',
	      String(gate.streak || 0) + '/' + String(gate.required || 0)
	    ];
	    if (gate.lastError) pieces.push('最近错误：' + gate.lastError);
	    return pieces.join('，');
		  }

	  function clearExitHoldDetail(detail, reason, t = Date.now()) {
    if (!detail || typeof detail !== 'object') return null;
    const reloginUntil = Number(detail.reloginUntil || 0) || 0;
    const previousHoldRemainingMs = Math.max(0, Math.round(reloginUntil - t));
    if (reloginUntil && !detail.manualLoginBypassPreviousReloginUntil) {
      detail.manualLoginBypassPreviousReloginUntil = reloginUntil;
    }
    if (previousHoldRemainingMs && !detail.manualLoginBypassPreviousHoldMs) {
      detail.manualLoginBypassPreviousHoldMs = previousHoldRemainingMs;
    }
    detail.manualLoginBypassAt = t;
    detail.manualLoginBypassReason = String(reason || 'manual force login');
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    detail.reloginDelayMs = 0;
    detail.reloginHpDelayMs = 0;
    detail.reloginMinimumDelayMs = 0;
    finalizeLeaveDisplayReason(detail);
    return detail;
  }

  function clearCurrentReloginHold(reason = 'manual force login') {
    const t = Date.now();
    const enemyDetail = activeEnemyLeaveDetail(t);
    const offlineDetail = activeOfflineLeaveDetail(t);
    let suppressUntil = 0;
    let suppressReason = '';
    try {
      suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      localStorage.removeItem(LOGIN_SUPPRESS_KEY);
      localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
    } catch (_) {}
    const cleared = {
      at: t,
      reason: String(reason || 'manual force login'),
      suppressReason,
      suppressUntil,
      suppressRemainingMs: Math.max(0, Math.round(suppressUntil - t)),
      enemyHoldRemainingMs: Math.max(
        0,
        Math.round(Number(enemyDetail?.holdRemainingMs || 0)),
        Math.round(Number(bot.pursuitReloginUntil || 0) - t)
      ),
      offlineHoldRemainingMs: Math.max(
        0,
        Math.round(Number(offlineDetail?.holdRemainingMs || 0)),
        Math.round(Number(bot.offlineReloginUntil || 0) - t)
      )
    };
    bot.pursuitReloginUntil = 0;
    bot.offlineReloginUntil = 0;
    bot.lastEnemyLeaveResult = clearExitHoldDetail(bot.lastEnemyLeaveResult, reason, t);
    bot.lastPursuitLeaveResult = clearExitHoldDetail(bot.lastPursuitLeaveResult, reason, t);
    bot.lastCombatLeaveResult = clearExitHoldDetail(bot.lastCombatLeaveResult, reason, t);
    bot.lastInjuryLeaveResult = clearExitHoldDetail(bot.lastInjuryLeaveResult, reason, t);
    bot.lastOfflineLeaveResult = clearExitHoldDetail(bot.lastOfflineLeaveResult, reason, t);
    bot.pendingExit = null;
    clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    return cleared;
  }

  function readPauseReason() {
    let reason = '';
    try {
      reason = String(localStorage.getItem(PAUSE_REASON_KEY) || '');
    } catch (_) {}
    return String(window.__graspRatBotPauseReason || reason || '');
  }

  function syncPausedFromPage(stopOnPause = true) {
    let localPaused = false;
    try {
      localPaused = localStorage.getItem(PAUSED_KEY) === 'true';
    } catch (_) {}
    const paused = Boolean(window.__graspRatBotPaused === true || localPaused);
    if (paused !== bot.paused) {
      bot.paused = paused;
      bot.pauseChangedAt = Date.now();
      if (paused && stopOnPause) stopMotionSafely('paused');
    }
    bot.pauseReason = paused ? (readPauseReason() || bot.pauseReason || 'manual') : '';
    return paused;
  }

  function randomBetween(min, max) {
    const lo = Math.max(0, Number(min) || 0);
    const hi = Math.max(lo, Number(max) || lo);
    return Math.round(lo + Math.random() * (hi - lo));
  }

	  function hpInfoForRelogin(selfLike, detail) {
    const candidates = [
      selfLike,
      detail?.self,
      detail?.injury?.self,
      detail?.injury,
      detail?.combat,
      detail?.combatState
    ].filter(Boolean);
    let hp = NaN;
    let maxHp = NaN;
    for (const item of candidates) {
      if (!Number.isFinite(hp)) hp = Number(item.currentHp ?? item.hp ?? item.selfHp ?? NaN);
      if (!Number.isFinite(maxHp)) maxHp = Number(item.maxHp ?? item.max_hp ?? item.hpMax ?? item.maxHealth ?? NaN);
      if (Number.isFinite(hp) && Number.isFinite(maxHp)) break;
    }
    if (!Number.isFinite(maxHp) || maxHp <= 0) maxHp = 100;
    if (!Number.isFinite(hp)) hp = maxHp;
    hp = clamp(hp, 0, maxHp);
	    return {
	      hp,
	      maxHp,
	      ratio: maxHp > 0 ? clamp(hp / maxHp, 0, 1) : 1
	    };
	  }

  function actorLabel(actor) {
    if (!actor) return '未知目标';
    const id = actor.user_id ?? actor.id ?? actor.targetId;
    return actor.name || actor.label || (id !== undefined && id !== null && id !== '' ? '#' + id : '未知目标');
  }

  function hpDisplay(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : '-';
  }

	  function formatDurationMs(ms) {
	    const value = Math.max(0, Math.round(Number(ms) || 0));
	    if (value >= 3600000) {
	      const minutes = Math.round(value / 60000);
	      if (minutes % 60 === 0) return Math.round(minutes / 60) + '小时';
      return minutes + '分钟';
    }
    if (value >= 60000) return Math.round(value / 60000) + '分钟';
	    if (value >= 1000) return Math.round(value / 1000) + '秒';
	    return value + 'ms';
	  }

	  function staminaExhaustedWindowLabel(staminaState) {
	    const raw = Array.isArray(staminaState?.longExhausted)
	      ? staminaState.longExhausted
	      : (Array.isArray(staminaState?.exhausted) ? staminaState.exhausted : []);
	    const windows = [];
	    for (const item of raw) {
	      const key = String(item || '').toLowerCase();
	      if ((key === '1h' || key === '1d') && !windows.includes(key)) windows.push(key);
	    }
	    return windows.join('/');
	  }

	  function leaveWaitDisplay(base, detail) {
	    const summary = String(base || '').trim();
	    const waitMs = Number(detail?.reloginDelayMs ?? detail?.holdRemainingMs ?? 0);
	    if (!summary || !Number.isFinite(waitMs) || waitMs <= 0) return summary;
    return summary + '，等待' + formatDurationMs(waitMs);
  }

  function finalizeLeaveDisplayReason(detail) {
    if (!detail) return detail;
    const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
    if (!base) return detail;
    detail.summary = base;
    detail.displayReason = leaveWaitDisplay(base, detail);
    return detail;
  }

  function normalizeEnemyActor(actor) {
    if (!actor) return null;
    const rawId = actor.user_id ?? actor.id ?? actor.targetId;
    const id = rawId !== undefined && rawId !== null && rawId !== '' ? String(rawId) : '';
    const name = String(actor.name ?? actor.targetName ?? '').trim();
    const key = id ? 'id:' + id : (name ? 'name:' + name : '');
    if (!key) return null;
    return {
      key,
      id,
      name,
      label: name || ('#' + id)
    };
  }

  function enemyActorFromLeaveDetail(detail) {
    return normalizeEnemyActor(detail?.enemyActor)
      || normalizeEnemyActor(detail?.target)
      || normalizeEnemyActor(detail?.pursuit)
      || normalizeEnemyActor(detail?.injury?.nearestActive)
      || normalizeEnemyActor(detail?.injury?.nearestAvoidance)
      || normalizeEnemyActor(detail?.injury?.nearestHuman)
      || null;
  }

  function enemyRepeatDelayMsForCount(count) {
    const n = Math.max(0, Number(count) || 0);
    const secondMs = Math.max(0, Number(cfg.enemyReloginRepeatSecondMaxMs) || 0);
    const thirdMs = Math.max(secondMs, Number(cfg.enemyReloginRepeatThirdMaxMs) || 0);
    if (n >= 3) return thirdMs;
    if (n >= 2) return secondMs;
    return 0;
  }

  function readEnemyLeaveStreak(t = Date.now()) {
    let streak = null;
    try {
      streak = JSON.parse(localStorage.getItem(ENEMY_LEAVE_STREAK_KEY) || 'null');
    } catch (_) {
      streak = null;
    }
    if (!streak || typeof streak !== 'object' || !streak.key) return null;
    const resetMs = Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0);
    if (resetMs && t - Number(streak.at || 0) > resetMs) {
      try {
        localStorage.removeItem(ENEMY_LEAVE_STREAK_KEY);
      } catch (_) {}
      if (bot.enemyLeaveStreak?.key === streak.key) bot.enemyLeaveStreak = null;
      return null;
    }
    const normalized = {
      key: String(streak.key),
      id: streak.id === undefined || streak.id === null ? '' : String(streak.id),
      name: String(streak.name || ''),
      label: String(streak.label || streak.name || (streak.id ? '#' + streak.id : '')),
      count: Math.max(1, Number(streak.count || 1)),
      firstAt: Number(streak.firstAt || streak.at || t),
      previousAt: Number(streak.previousAt || 0),
      at: Number(streak.at || t),
      resetMs
    };
    normalized.reloginMinMs = enemyRepeatDelayMsForCount(normalized.count);
    bot.enemyLeaveStreak = normalized;
    return normalized;
  }

  function writeEnemyLeaveStreak(streak) {
    bot.enemyLeaveStreak = streak;
    try {
      localStorage.setItem(ENEMY_LEAVE_STREAK_KEY, JSON.stringify(streak));
    } catch (_) {}
  }

	  function updateEnemyLeaveStreak(detail, t = Date.now()) {
	    const actor = enemyActorFromLeaveDetail(detail);
	    if (!actor) {
	      readEnemyLeaveStreak(t);
	      if (detail) detail.enemyLeaveStreak = null;
	      return null;
	    }
    const previous = readEnemyLeaveStreak(t);
    const same = previous && previous.key === actor.key;
    const count = same ? Number(previous.count || 1) + 1 : 1;
    const streak = {
      ...actor,
      count,
      firstAt: same ? Number(previous.firstAt || previous.at || t) : t,
      previousAt: same ? Number(previous.at || 0) : 0,
      at: t,
      resetMs: Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0),
      reloginMinMs: enemyRepeatDelayMsForCount(count)
    };
    writeEnemyLeaveStreak(streak);
    if (detail) {
      detail.enemyActor = actor;
      detail.enemyLeaveStreak = streak;
      if (streak.reloginMinMs > 0) {
        detail.reloginRepeatDelayMs = streak.reloginMinMs;
        detail.reloginRepeatCount = streak.count;
      }
    }
    return streak;
  }

  function combatExitSummary(reason, target, combatState = {}) {
    const selfHp = Number(combatState.selfHp ?? combatState.hp ?? NaN);
    const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
    const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
    if (reason === 'combat-critical-hp-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
    }
    if (reason === 'combat-hp-disadvantage-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方HP ' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + '，劣势退出';
    }
    if (reason === 'combat-low-hp-no-damage-leave') {
      const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
        ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方HP ' + hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
    }
    if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
      const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
        ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
        : '';
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方HP ' + hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
    }
    return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方HP ' + hpDisplay(targetHp) + '，劣势退出';
  }

  function combatLeaveAction(reason, baseTarget, combatState = {}, cover = null) {
    const exitSummary = combatExitSummary(reason, baseTarget, combatState);
    const normalizedCover = cover ? { ...cover, target: cover.target || baseTarget } : null;
    return {
      kind: 'leave',
      reason,
      exitSummary,
      displayReason: exitSummary,
      combat: true,
      ignoreReturnBlock: true,
      dx: normalizedCover ? clamp(Math.round(Number(normalizedCover.dx) || 0), -1, 1) : 0,
      dy: normalizedCover ? clamp(Math.round(Number(normalizedCover.dy) || 0), -1, 1) : 0,
      shoot: Boolean(normalizedCover?.shoot),
      forceShoot: Boolean(normalizedCover?.forceShoot),
      shootEveryMs: normalizedCover?.shootEveryMs,
      aimTarget: normalizedCover?.aimTarget || null,
      incomingBullet: normalizedCover?.incomingBullet || null,
      target: baseTarget,
      combatCover: normalizedCover,
      combatState: {
        ...combatState,
        leaveCover: normalizedCover
      }
    };
  }

  function pursuitLeaveSummary(pursuit) {
    const target = pursuit || {};
    const duration = Number(target.durationMs);
    const durationText = Number.isFinite(duration) && duration > 0 ? '，持续' + formatDurationMs(duration) : '';
    const distance = Number(target.distance);
    const distanceText = Number.isFinite(distance) ? '，距离' + formatDistance(distance) : '';
    return '被' + actorLabel(target) + '持续追击' + durationText + distanceText + '，退出等待重连';
  }

	  function injuryLeaveSummary(injury) {
	    const actor = injury?.nearestActive || injury?.nearestAvoidance || injury?.nearestHuman || null;
	    const previousHp = Number(injury?.previousHp ?? NaN);
    const currentHp = Number(injury?.currentHp ?? injury?.self?.hp ?? NaN);
    const hpText = Number.isFinite(previousHp) && Number.isFinite(currentHp)
      ? '，血量从' + hpDisplay(previousHp) + '降到' + hpDisplay(currentHp)
      : (Number.isFinite(currentHp) ? '，当前血量' + hpDisplay(currentHp) : '');
	    return (actor ? '受到' + actorLabel(actor) + '伤害/附近威胁' : '检测到血量下降') + hpText + '，退出等待重连';
	  }

			  function offlineLeaveSummary(reason, offlineSafety) {
			    if (offlineSafety?.staminaBudgetExit) {
			      return staminaBudgetCoinLeaveSummary(offlineSafety.staminaBudgetExit);
			    }
			    const staminaLabel = staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
			    if (staminaLabel) return staminaLabel + '体力到达限制，退出等待重连';
			    const text = String(reason || '').toLowerCase();
			    if (text.includes('stamina')) return '长周期体力到达限制，退出等待重连';
			    if (offlineSafety?.noSelfGameSession || text.includes('missing self')) return '已登录但自身实体不可见，退出等待重连';
			    if (text.includes('reconnect churn') || offlineSafety?.reconnectChurn) return 'WebSocket 反复重连，退出等待重连';
		    if (text.includes('server position')) return '服务端位置停止，按离线处理，退出等待重连';
		    if (offlineSafety?.unsafe) return 'WebSocket 离线且周围危险，退出等待重连';
		    return 'WebSocket 离线，退出等待重连';
		  }

	  function reloginDelayForHp(selfLike, detail) {
	    const info = hpInfoForRelogin(selfLike, detail);
	    const minMs = Math.max(1000, Number(cfg.enemyReloginMinDelayMs) || 60000);
    const repeatMinMs = Math.max(0, Number(detail?.enemyLeaveStreak?.reloginMinMs ?? detail?.reloginRepeatDelayMs ?? 0) || 0);
    const baseMaxMs = Math.max(minMs, Number(cfg.enemyReloginMaxDelayMs) || minMs);
	    const maxMs = Math.max(baseMaxMs, repeatMinMs);
	    const dangerFactor = Math.pow(1 - info.ratio, 1.35);
	    const jitterMs = Math.max(0, Number(cfg.enemyReloginJitterMs) || 0);
	    const hpDelayMs = clamp(
	      Math.round(minMs + (maxMs - minMs) * dangerFactor + randomBetween(0, jitterMs)),
	      minMs,
	      maxMs
	    );
    const delayMs = Math.max(hpDelayMs, repeatMinMs);
	    return { delayMs, hpDelayMs, minMs, maxMs, baseMaxMs, repeatMinMs, hp: info };
	  }

  function isExitLoginSuppressReason(reason) {
    return /enemy leave|offline.*leave|combat leave|pursuit leave/i.test(String(reason || ''));
  }

  function setExitReloginSuppress(storageReason, reason, detail, selfLike, options = {}) {
    let existingUntil = Number(options.existingUntil || 0);
    let existingReason = '';
    const minimumUntil = Math.max(0, Number(options.minimumUntil || 0) || 0);
    try {
      const storedReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      const storedUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      if (isExitLoginSuppressReason(storedReason) && storedUntil > existingUntil) {
        existingUntil = storedUntil;
        existingReason = storedReason;
      }
    } catch (_) {}
    const t = Date.now();
	    if (existingUntil > t && existingUntil >= minimumUntil) {
	      const holdReason = existingReason || storageReason;
	      if (storageReason === 'enemy leave' || /enemy leave|combat leave|pursuit leave/i.test(holdReason)) bot.pursuitReloginUntil = existingUntil;
	      if (storageReason === 'offline leave' || /offline.*leave/i.test(holdReason)) bot.offlineReloginUntil = existingUntil;
		      if (detail) {
		        detail.reloginUntil = existingUntil;
		        detail.holdRemainingMs = Math.max(0, Math.round(existingUntil - Date.now()));
		        detail.enemyLeaveReason = reason;
		        detail.loginSuppressReason = holdReason;
		        detail.reusedExitSuppress = true;
		        finalizeLeaveDisplayReason(detail);
		        if (storageReason === 'enemy leave') {
		          bot.lastEnemyLeaveResult = detail;
		          bot.lastEnemyLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastEnemyLeaveWaitMs || 0);
		          writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
		        } else if (storageReason === 'offline leave') {
		          bot.lastOfflineLeaveResult = detail;
		          bot.lastOfflineLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastOfflineLeaveWaitMs || 0);
		          writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
		        }
		      }
		      return existingUntil;
		    }
	    if (storageReason === 'enemy leave') updateEnemyLeaveStreak(detail, t);
	    const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
	    const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
	    const delay = fixedDelayMs
	      ? {
	        delayMs: fixedDelayMs,
	        hpDelayMs: fixedDelayMs,
	        minMs: fixedDelayMs,
	        maxMs: fixedDelayMs,
	        baseMaxMs: fixedDelayMs,
	        repeatMinMs: 0,
	        hp: hpInfoForRelogin(selfLike, detail)
	      }
	      : reloginDelayForHp(selfLike, detail);
	    const minimumDelayMs = minimumUntil > t ? Math.max(0, Math.round(minimumUntil - t)) : 0;
	    const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
	    const reloginUntil = setLoginSuppress(storageReason, reloginDelayMs);
    if (storageReason === 'enemy leave') {
      bot.pursuitReloginUntil = reloginUntil;
      bot.lastEnemyLeaveWaitMs = reloginDelayMs;
    } else if (storageReason === 'offline leave') {
      bot.offlineReloginUntil = reloginUntil;
      bot.lastOfflineLeaveWaitMs = reloginDelayMs;
    }
	    if (detail) {
	      detail.reloginDelayMs = reloginDelayMs;
	      detail.reloginHpDelayMs = delay.hpDelayMs;
	      detail.reloginDelayRangeMs = {
	        min: delay.minMs,
	        max: delay.maxMs,
	        baseMax: delay.baseMaxMs,
	        repeatMin: delay.repeatMinMs
	      };
	      if (minimumDelayMs) {
	        detail.reloginMinimumDelayMs = minimumDelayMs;
	        detail.reloginMinimumUntil = minimumUntil;
	        detail.reloginMinimumReason = options.minimumReason || '';
	      }
	      if (fixedDelayMs) detail.reloginFixedDelayMs = fixedDelayMs;
	      detail.reloginHp = delay.hp;
	      detail.reloginUntil = reloginUntil;
	      detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - Date.now()));
		      detail.enemyLeaveReason = reason;
		      detail.loginSuppressReason = storageReason;
		      finalizeLeaveDisplayReason(detail);
		      if (storageReason === 'enemy leave') {
		        bot.lastEnemyLeaveResult = detail;
		        writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
		      } else if (storageReason === 'offline leave') {
		        bot.lastOfflineLeaveResult = detail;
		        writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
		      }
		    }
    return reloginUntil;
  }

  function unsafeExitReloginMinDelayMs() {
    return Math.max(0, Number(cfg.unsafeExitReloginMinDelayMs ?? cfg.enemyReloginMinDelayMs ?? 60000) || 0);
  }

  function pendingExitSuppressReason(storageReason) {
    const text = String(storageReason || '').toLowerCase();
    if (text.includes('offline')) return 'pending unsafe disconnect exit';
    if (text.includes('enemy') || text.includes('combat') || text.includes('pursuit') || text.includes('injury')) {
      return 'pending unsafe hostile exit';
    }
    return 'pending unsafe exit';
  }

	  function startExitAudit(detail, meta = {}) {
	    if (!detail || typeof detail !== 'object') return null;
	    detail.loginSnapshotGateReset = resetLoginSnapshotGate('exit-trigger:' + (meta.reason || detail.reason || ''));
	    ensureExitAuditDetail(detail, meta);
	    recordExitAuditEvent('exit-trigger', detail, {
      ...meta,
      at: Number(detail.exitTriggeredAt || detail.at || Date.now())
    });
    return detail.exitAuditId;
  }

  function primePendingUnsafeExitLoginSuppress(storageReason, reason, detail, selfLike = null, options = {}) {
    if (!detail || !detail.attempted) return 0;
    const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
    const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
    const delay = fixedDelayMs
      ? { delayMs: fixedDelayMs, hpDelayMs: fixedDelayMs, hp: hpInfoForRelogin(selfLike, detail) }
      : reloginDelayForHp(selfLike, detail);
    const minimumDelayMs = Math.max(
      unsafeExitReloginMinDelayMs(),
      Math.max(0, Number(options.minimumDelayMs || 0) || 0)
    );
    const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
    if (!(delayMs > 0)) return 0;
    const suppressReason = pendingExitSuppressReason(storageReason);
    const until = setLoginSuppress(suppressReason, delayMs);
    detail.pendingLoginSuppressReason = suppressReason;
    detail.pendingLoginSuppressUntil = until;
    detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - Date.now()));
    detail.pendingLoginSuppressMinimumDelayMs = minimumDelayMs;
    detail.pendingLoginSuppressHpDelayMs = delay.hpDelayMs || 0;
    detail.pendingLoginSuppressHp = delay.hp || null;
    if (reason) detail.enemyLeaveReason = detail.enemyLeaveReason || reason;
    return until;
  }

  function setEnemyLeaveSuppress(reason, detail, selfLike = null, options = {}) {
    return setExitReloginSuppress('enemy leave', reason, detail, selfLike, options);
  }

	  function staminaBudgetExitHoldUntil(staminaBudgetExit, t = Date.now()) {
	    if (!staminaBudgetExit) return null;
	    const delayMs = staminaBudgetReloginDelayMs();
	    return {
	      until: t + delayMs,
	      fixedDelayMs: delayMs,
	      fixed: true,
	      reason: 'stamina budget',
	      staminaBudgetExit
	    };
	  }

  function staminaExitHoldUntilForDetail(detail, t = Date.now()) {
    const holds = [
      staminaBudgetExitHoldUntil(detail?.offlineSafety?.staminaBudgetExit, t),
      staminaResetHoldUntil(detail?.offlineSafety?.staminaExhausted, t)
    ].filter(Boolean);
    if (!holds.length) return null;
    return holds.sort((a, b) => Number(b.until || 0) - Number(a.until || 0))[0] || null;
  }

  function offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety) {
	    if (!offlineSafety) return false;
	    if (offlineSafety.unsafe || offlineSafety.reconnectChurn || offlineSafety.noSelfGameSession || offlineSafety.staminaExhausted) return true;
	    const text = String(reason || '').toLowerCase();
	    return text.includes('reconnect churn') || text.includes('server position') || text.includes('stamina') || text.includes('missing self');
	  }

	  function setOfflineLeaveSuppress(reason, detail, selfLike = null, options = {}) {
		    const staminaHold = staminaExitHoldUntilForDetail(detail);
		    if (staminaHold && detail) {
		      if (staminaHold.staminaBudgetExit) detail.staminaBudgetHold = staminaHold;
		      else detail.staminaReset = staminaHold;
		    }
		    if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now()) && !offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null)) {
		      bot.offlineReloginUntil = 0;
		      bot.lastOfflineLeaveWaitMs = 0;
		      if (detail) {
		        detail.reloginUntil = 0;
		        detail.holdRemainingMs = 0;
		        detail.reloginDelayMs = 0;
		        detail.safeReloginAllowed = true;
		        detail.loginSuppressReason = '';
		        finalizeLeaveDisplayReason(detail);
		        bot.lastOfflineLeaveResult = detail;
		      }
		      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
		      return 0;
		    }
		    return setExitReloginSuppress('offline leave', reason, detail, selfLike, {
		      existingUntil: bot.offlineReloginUntil,
		      minimumUntil: Math.max(Number(options.minimumUntil || 0) || 0, staminaHold?.until || 0),
	      minimumReason: options.minimumReason || staminaHold?.reason || (staminaHold ? 'stamina reset' : ''),
	      fixedDelayMs: staminaHold?.fixed ? staminaHold.fixedDelayMs : 0
	    });
	  }

	  function primePendingStaminaExitLoginSuppress(detail) {
	    const hold = staminaExitHoldUntilForDetail(detail);
	    if (!hold) return 0;
	    const delayMs = hold.fixed
	      ? hold.fixedDelayMs
	      : Math.max(1000, Math.round(Number(hold.until || 0) - Date.now()));
	    const until = setLoginSuppress('stamina leave pending', delayMs);
	    if (detail) {
	      detail.pendingLoginSuppressUntil = until;
	      detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - Date.now()));
	      if (hold.staminaBudgetExit) detail.staminaBudgetHold = hold;
	      else detail.staminaReset = hold;
	    }
	    return until;
	  }

  function enemyReloginHoldRemainingMs() {
    let until = Number(bot.pursuitReloginUntil || 0);
    const persistent = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    if (Number(persistent?.reloginUntil || 0) > until) {
      until = Number(persistent.reloginUntil);
      bot.pursuitReloginUntil = until;
      bot.lastEnemyLeaveResult = persistent;
    }
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if ((suppressReason === 'enemy leave' || suppressReason === 'pursuit leave' || suppressReason === 'combat leave') && suppressUntil > until) {
        until = suppressUntil;
        bot.pursuitReloginUntil = suppressUntil;
      }
    } catch (_) {}
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && bot.pursuitReloginUntil) {
      bot.pursuitReloginUntil = 0;
      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    }
    return Math.round(remaining);
  }

  function offlineReloginHoldRemainingMs() {
    let until = Number(bot.offlineReloginUntil || 0);
    const persistent = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    if (Number(persistent?.reloginUntil || 0) > until) {
      until = Number(persistent.reloginUntil);
      bot.offlineReloginUntil = until;
      bot.lastOfflineLeaveResult = persistent;
    }
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if (/offline.*leave/i.test(suppressReason) && suppressUntil > until) {
        until = suppressUntil;
        bot.offlineReloginUntil = suppressUntil;
      }
    } catch (_) {}
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && bot.offlineReloginUntil) {
      bot.offlineReloginUntil = 0;
      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    }
    return Math.round(remaining);
  }

  function clearLoginSuppressMatching(pattern) {
    try {
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if (!pattern.test(suppressReason)) return false;
      localStorage.removeItem(LOGIN_SUPPRESS_KEY);
      localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearOfflineReloginHold(reason = 'online self restored') {
    const t = Date.now();
    bot.offlineReloginUntil = 0;
    bot.lastOfflineLeaveWaitMs = 0;
    bot.pendingExit = bot.pendingExit?.scope === 'offline' ? null : bot.pendingExit;
    if (bot.lastOfflineLeaveResult && typeof bot.lastOfflineLeaveResult === 'object') {
      bot.lastOfflineLeaveResult.onlineRecoveryAt = t;
      bot.lastOfflineLeaveResult.onlineRecoveryReason = String(reason || 'online self restored');
      bot.lastOfflineLeaveResult.reloginUntil = 0;
      bot.lastOfflineLeaveResult.holdRemainingMs = 0;
      bot.lastOfflineLeaveResult.reloginDelayMs = 0;
    }
    bot.lastOfflineLeaveResult = null;
    clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    clearLoginSuppressMatching(/offline.*leave/i);
  }

	  function summarizePursuit(pursuit = bot.pursuit) {
	    if (!pursuit) return null;
	    const t = now();
	    const lastSeenAt = Number(pursuit.lastSeenAt || pursuit.startedAt || t);
	    const thresholdMs = Number.isFinite(Number(pursuit.thresholdMs)) ? Number(pursuit.thresholdMs) : cfg.pursuitLeaveMs;
	    return {
	      id: pursuit.id,
	      name: pursuit.name || '',
      distance: Number.isFinite(Number(pursuit.distance)) ? Math.round(Number(pursuit.distance)) : null,
      speed: Number.isFinite(Number(pursuit.speed)) ? Math.round(Number(pursuit.speed)) : null,
      moving: Boolean(pursuit.moving),
	      active: Boolean(pursuit.active),
	      reason: pursuit.reason || '',
	      durationMs: Math.max(0, Math.round(Number(pursuit.durationMs ?? (lastSeenAt - Number(pursuit.startedAt || lastSeenAt))))),
	      thresholdMs,
	      invulnerable: Boolean(pursuit.invulnerable),
	      nonFullHp: Boolean(pursuit.nonFullHp),
	      lastSeenAgeMs: Math.max(0, Math.round(t - lastSeenAt)),
      towardScore: Number.isFinite(Number(pursuit.towardScore)) ? Number(pursuit.towardScore).toFixed(2) : null,
      closingDistance: Number.isFinite(Number(pursuit.closingDistance)) ? Math.round(Number(pursuit.closingDistance)) : null
    };
  }

  function cloneForPendingExit(value) {
    if (!value || typeof value !== 'object') return value || null;
    return safeJsonClone(value) || { ...value };
  }

  function pendingExitRetryMs(pending) {
    const source = String(pending?.source || '');
    const retryFloorMs = Math.max(
      1000,
      Number(cfg.leaveRetryMinMs ?? cfg.leaveCommandTimeoutMs ?? 10000) || 10000
    );
    if (pending?.scope === 'offline' || source === 'offline') {
      return Math.max(retryFloorMs, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    }
    if (source === 'pursuit') {
      return Math.max(retryFloorMs, Number(cfg.pursuitLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    }
    return Math.max(retryFloorMs, Number(cfg.combatLeaveRetryMs || cfg.pursuitLeaveRetryMs || 1000));
  }

  function pendingExitDisplayReason(summary) {
    const base = String(summary || '退出请求已发送').trim();
    return base + '，等待退出确认，未退出会继续补发';
  }

  function summarizePendingExit(pending = bot.pendingExit) {
    if (!pending) return null;
    const t = Date.now();
    const retryMs = pendingExitRetryMs(pending);
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    return {
      scope: pending.scope || '',
      source: pending.source || '',
      reason: pending.reason || '',
      summary: pending.summary || '',
      displayReason: pending.displayReason || '',
      at: Number(pending.at || 0),
      ageMs: pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0,
      lastAttemptAt,
      lastAttemptAgeMs: lastAttemptAt ? Math.max(0, Math.round(t - lastAttemptAt)) : null,
      retryMs,
      retryRemainingMs: lastAttemptAt ? Math.max(0, Math.round(retryMs - (t - lastAttemptAt))) : 0,
      retryCount: Number(pending.retryCount || 0),
      leaveRequestPending: Boolean(pending.lastResult?.leaveRequestPending),
      userId: pending.userId || null,
      combatCover: pending.combatCover ? {
        reason: pending.combatCover.reason || '',
        dx: clamp(Math.round(Number(pending.combatCover.dx) || 0), -1, 1),
        dy: clamp(Math.round(Number(pending.combatCover.dy) || 0), -1, 1),
        shoot: Boolean(pending.combatCover.shoot)
      } : null,
      lastError: pending.lastResult?.error || ''
    };
  }

  function pendingExitSkipNewLeave(source, reason, extra = {}) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const summary = pending.summary || extra.summary || String(reason || '').trim() || '退出请求已发送';
    return finalizeLeaveDisplayReason({
      ...extra,
      attempted: false,
      method: '',
      reason: 'pending-exit-active',
      skippedNewLeave: true,
      skippedSource: source || '',
      skippedReason: reason || '',
      exitPending: true,
      exitConfirmed: false,
      pendingExit: summarizePendingExit(pending),
      summary,
      error: ''
    });
  }

  function pendingExitIntentForSkippedLeave(source, reason, detail = null) {
    return {
      reason: 'pending-exit-active',
      source: source || '',
      skippedReason: reason || '',
      summary: detail?.summary || bot.pendingExit?.summary || '',
      pendingExit: summarizePendingExit()
    };
  }

  function recordPendingExitResult(source, detail, t = Date.now()) {
    if (source === 'offline') {
      bot.lastOfflineLeaveAt = t;
      bot.lastOfflineLeaveResult = detail;
    } else if (source === 'pursuit') {
      bot.lastPursuitLeaveAt = t;
      bot.lastPursuitLeaveResult = detail;
    } else if (source === 'injury') {
      bot.lastInjuryLeaveAt = t;
      bot.lastInjuryLeaveResult = detail;
    } else {
      bot.lastCombatLeaveAt = t;
      bot.lastCombatLeaveResult = detail;
    }
  }

  function rememberPendingExit(scope, source, detail, selfLike = null) {
    if (!detail?.attempted && !detail?.exitAuditId) return null;
    const t = Date.now();
    const previous = bot.pendingExit && bot.pendingExit.scope === scope ? bot.pendingExit : null;
    const summary = detail.summary || detail.exitSummary || detail.enemyLeaveSummary || previous?.summary || detail.reason || '';
    const pending = {
      scope,
      source,
      reason: detail.reason || previous?.reason || '',
      summary,
      displayReason: pendingExitDisplayReason(summary),
      at: Number(previous?.at || detail.at || t),
      updatedAt: t,
      lastAttemptAt: Number(detail.at || t),
      retryCount: Number(previous?.retryCount || 0) + 1,
      retryMs: pendingExitRetryMs({ scope, source }),
      userId: detail.userId || getCurrentUserId() || previous?.userId || null,
      self: cloneForPendingExit(selfLike || detail.self || previous?.self || null),
      offlineSafety: cloneForPendingExit(detail.offlineSafety || previous?.offlineSafety || null),
      target: cloneForPendingExit(detail.target || previous?.target || null),
      pursuit: cloneForPendingExit(detail.pursuit || previous?.pursuit || null),
      injury: cloneForPendingExit(detail.injury || previous?.injury || null),
      combat: cloneForPendingExit(detail.combat || previous?.combat || null),
      combatCover: cloneForPendingExit(detail.combatCover || detail.combat?.leaveCover || previous?.combatCover || null),
      lastResult: cloneForPendingExit(detail)
    };
    bot.pendingExit = pending;
    detail.exitPending = true;
    detail.exitConfirmed = false;
    detail.pendingExit = summarizePendingExit(pending);
    detail.displayReason = pending.displayReason;
    return pending;
  }

  function pendingExitSelfState(self) {
    const userId = getCurrentUserId();
    if (!userId) return { known: true, alive: false, source: 'no-current-user-id', self: null };
    try {
      const nativeSelf = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
      if (nativeSelf && Number(nativeSelf.user_id) === userId) {
        return { known: true, alive: Boolean(isAlive(nativeSelf)), source: 'native-own', self: summarizeSelf(nativeSelf) };
      }
    } catch (_) {}
    const nativeState = getNativeState();
    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
    if (nativeEntities) {
      const nativeSelf = nativeEntities.find(entity => Number(entity.user_id) === userId) || null;
      if (nativeSelf) {
        return {
          known: true,
          alive: Boolean(isAlive(nativeSelf)),
          source: 'native-entities',
          self: summarizeSelf(nativeSelf)
        };
      }
    }
    if (self) {
      return { known: true, alive: Boolean(isAlive(self)), source: 'tick-self', self: summarizeSelf(self) };
    }
    if (hasNativeGameSession(getNativeControl(), userId)) {
      return { known: false, alive: false, source: 'native-session-pending', self: null };
    }
    if (hasLoginRequiredText() || findLoginControl()) {
      return { known: true, alive: false, source: 'login-required', self: null };
    }
    if (snapshotSelfFreshEnough()) {
      const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === userId) || null;
      return {
        known: true,
        alive: Boolean(snapshotSelf && isAlive(snapshotSelf)),
        source: 'snapshot',
        self: snapshotSelf ? summarizeSelf(snapshotSelf) : null
      };
    }
    return { known: false, alive: false, source: 'unknown', self: null };
  }

  function escapeRegExpLiteral(value) {
    return String(value || '').replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  }

  function chatLeftUserMessageSeen(userId = getCurrentUserId()) {
    const id = String(userId || '').trim();
    if (!id) return false;
    const pattern = new RegExp('(?:^|\\\\b)left\\\\s+user\\\\s+' + escapeRegExpLiteral(id) + '(?:\\\\b|$)', 'i');
    const selectors = [
      '#chat',
      '#chatLog',
      '#chatMessages',
      '.chat',
      '.chat-log',
      '.chat-messages',
      '.messages',
      '.side'
    ];
    const roots = [];
    for (const selector of selectors) {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el && !roots.includes(el)) roots.push(el);
        });
      } catch (_) {}
    }
    if (!roots.length && document.body) roots.push(document.body);
    for (const root of roots) {
      const text = String(root?.innerText || root?.textContent || '');
      if (pattern.test(text)) return true;
    }
    return false;
  }

  function ownEntityDisappearedState(self, userId = getCurrentUserId()) {
    const id = Number(userId || 0);
    if (!id) return { known: false, present: false, disappeared: false, sources: [] };
    let known = false;
    let present = false;
    const sources = [];
    try {
      if (typeof getOwnEntity === 'function') {
        known = true;
        sources.push('native-own');
        const nativeSelf = getOwnEntity();
        if (nativeSelf && Number(nativeSelf.user_id) === id && isAlive(nativeSelf)) present = true;
      }
    } catch (_) {}
    const nativeState = getNativeState();
    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
    if (nativeEntities) {
      known = true;
      sources.push('native-entities');
      const nativeSelf = nativeEntities.find(entity => Number(entity.user_id) === id) || null;
      if (nativeSelf && isAlive(nativeSelf)) present = true;
    }
    if (self) {
      known = true;
      sources.push('tick-self');
      if (Number(self.user_id) === id && isAlive(self)) present = true;
    }
    if (snapshotSelfFreshEnough()) {
      known = true;
      sources.push('snapshot');
      const snapshotSelf = (bot.globalState.entities || []).find(entity => Number(entity.user_id) === id) || null;
      if (snapshotSelf && isAlive(snapshotSelf)) present = true;
    }
    return {
      known,
      present,
      disappeared: Boolean(known && !present),
      sources
    };
  }

  function pendingExitLocalConfirmationState(pending, self, state = null) {
    const userId = Number(pending?.userId || getCurrentUserId() || 0);
    const tokenCleared = !getSessionToken();
    const chatLeftUser = chatLeftUserMessageSeen(userId);
    const ownEntity = ownEntityDisappearedState(self, userId);
    const confirmed = Boolean(tokenCleared && chatLeftUser && ownEntity.disappeared);
    return {
      known: confirmed,
      alive: false,
      source: confirmed ? 'token-chat-left-user-self-missing' : 'local-exit-evidence-incomplete',
      self: null,
      localExitConfirmation: true,
      confirmed,
      tokenCleared,
      chatLeftUser,
      ownEntity,
      previousState: state || null
    };
  }

  function leaveRequestHasHttp403(request) {
    if (!request || typeof request !== 'object') return false;
    const status = Number(request.status ?? request.statusCode ?? request.result?.status ?? request.result?.statusCode ?? NaN);
    if (status === 403) return true;
    const fields = [
      request.error,
      request.message,
      request.statusText,
      request.result?.error,
      request.result?.message,
      request.result?.statusText
    ];
    return fields.some(value => /(?:^|\D)403(?:\D|$)|forbidden/i.test(String(value || '')));
  }

  function leaveDetailHasHttp403(detail) {
    if (!detail || typeof detail !== 'object') return false;
    if (leaveRequestHasHttp403(detail) || leaveRequestHasHttp403(detail.lastLeaveRequest)) return true;
    return Array.isArray(detail.leaveRequests) && detail.leaveRequests.some(leaveRequestHasHttp403);
  }

  function leaveDetailSucceeded(detail) {
    if (!detail || typeof detail !== 'object') return false;
    if (!detail.attempted || detail.leaveRequestPending || detail.error || leaveDetailHasHttp403(detail)) return false;
    const request = detail.lastLeaveRequest || (Array.isArray(detail.leaveRequests) ? detail.leaveRequests[detail.leaveRequests.length - 1] : null);
    return !request || Boolean(request.completedAt || request.method || detail.method);
  }

  function leave403ReloginDelayMs() {
    return Math.max(3600000, Number(cfg.leave403ReloginDelayMs || 0) || 0);
  }

  function leave403SnapshotSuccessRequired() {
    return Math.max(1, Math.round(Number(cfg.leave403SnapshotSuccessRequired || 5) || 5));
  }

  function leaveDetailHasHttp403RiskControl(detail) {
    if (!detail || typeof detail !== 'object') return false;
    return Boolean(
      detail.http403RiskControl
        || detail.http403RiskControlCleared
        || String(detail.reloginMinimumReason || '').includes('leave HTTP 403')
        || leaveDetailHasHttp403(detail)
    );
  }

  function leave403RiskHoldActive(detail, t = Date.now()) {
    return Boolean(
      leaveDetailHasHttp403RiskControl(detail)
        && Number(detail?.reloginUntil || 0) > t
    );
  }

  function currentLeave403RiskHolds(t = Date.now()) {
    const enemy = activeEnemyLeaveDetail(t);
    const offline = activeOfflineLeaveDetail(t);
    const enemyActive = leave403RiskHoldActive(enemy, t);
    const offlineActive = leave403RiskHoldActive(offline, t);
    return {
      enemy: enemyActive ? enemy : null,
      offline: offlineActive ? offline : null,
      active: Boolean(enemyActive || offlineActive)
    };
  }

  function clearLeave403RiskDetail(detail, reason, recovery, t = Date.now()) {
    if (!leaveDetailHasHttp403RiskControl(detail)) return false;
    const reloginUntil = Number(detail.reloginUntil || 0) || 0;
    const previousHoldMs = Math.max(0, Math.round(reloginUntil - t));
    if (reloginUntil && !detail.leave403PreviousReloginUntil) detail.leave403PreviousReloginUntil = reloginUntil;
    if (previousHoldMs && !detail.leave403PreviousHoldMs) detail.leave403PreviousHoldMs = previousHoldMs;
    detail.leave403SnapshotRecoveredAt = t;
    detail.leave403SnapshotRecoveryReason = reason;
    detail.leave403SnapshotSuccessStreak = Number(recovery?.streak || 0);
    detail.leave403SnapshotSuccessRequired = leave403SnapshotSuccessRequired();
    detail.http403RiskControlCleared = true;
    detail.reloginUntil = 0;
    detail.holdRemainingMs = 0;
    detail.reloginDelayMs = 0;
    detail.reloginHpDelayMs = 0;
    detail.reloginMinimumDelayMs = 0;
    detail.reloginMinimumUntil = 0;
    detail.reloginMinimumReason = '';
    finalizeLeaveDisplayReason(detail);
    return true;
  }

  function clearLeave403RiskHolds(reason = 'snapshot success streak') {
    const t = Date.now();
    const recovery = bot.leave403SnapshotRecovery || {};
    const enemyPersistent = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
    const offlinePersistent = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
    const enemyDetails = [
      bot.lastEnemyLeaveResult,
      bot.lastCombatLeaveResult,
      bot.lastPursuitLeaveResult,
      bot.lastInjuryLeaveResult,
      enemyPersistent
    ].filter(Boolean);
    const offlineDetails = [bot.lastOfflineLeaveResult, offlinePersistent].filter(Boolean);
    let clearedEnemy = false;
    let clearedOffline = false;
    for (const detail of enemyDetails) {
      if (leave403RiskHoldActive(detail, t) && clearLeave403RiskDetail(detail, reason, recovery, t)) clearedEnemy = true;
    }
    for (const detail of offlineDetails) {
      if (leave403RiskHoldActive(detail, t) && clearLeave403RiskDetail(detail, reason, recovery, t)) clearedOffline = true;
    }
    if (!clearedEnemy && !clearedOffline) return false;
    if (clearedEnemy) {
      bot.pursuitReloginUntil = 0;
      bot.lastEnemyLeaveWaitMs = 0;
      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    }
    if (clearedOffline) {
      bot.offlineReloginUntil = 0;
      bot.lastOfflineLeaveWaitMs = 0;
      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    }
    clearLoginSuppressMatching(
      clearedEnemy && clearedOffline
        ? /enemy leave|offline.*leave|combat leave|pursuit leave/i
        : (clearedEnemy ? /enemy leave|combat leave|pursuit leave/i : /offline.*leave/i)
    );
    bot.leave403SnapshotRecovery = {
      ...recovery,
      required: leave403SnapshotSuccessRequired(),
      clearedAt: t,
      clearedReason: reason,
      lastError: ''
    };
    logStatus('leave 403 risk control cleared by snapshot success', {
      kind: 'wait',
      reason: 'leave-403-snapshot-recovered',
      leave403SnapshotRecovery: bot.leave403SnapshotRecovery,
      clearedEnemy,
      clearedOffline
    });
    return true;
  }

  function noteLeave403SnapshotProbe(success, detail = {}) {
    const t = Date.now();
    const recovery = bot.leave403SnapshotRecovery || {};
    const required = leave403SnapshotSuccessRequired();
    bot.leave403SnapshotRecovery = {
      streak: Math.max(0, Number(recovery.streak || 0) || 0),
      required,
      lastOkAt: Number(recovery.lastOkAt || 0) || 0,
      lastErrorAt: Number(recovery.lastErrorAt || 0) || 0,
      lastError: String(recovery.lastError || ''),
      clearedAt: Number(recovery.clearedAt || 0) || 0,
      clearedReason: String(recovery.clearedReason || '')
    };
    const holds = currentLeave403RiskHolds(t);
    if (!holds.active) {
      bot.leave403SnapshotRecovery.streak = 0;
      return false;
    }
    if (success) {
      bot.leave403SnapshotRecovery.streak = Math.min(required, bot.leave403SnapshotRecovery.streak + 1);
      bot.leave403SnapshotRecovery.lastOkAt = t;
      bot.leave403SnapshotRecovery.lastError = '';
      if (bot.leave403SnapshotRecovery.streak >= required) {
        return clearLeave403RiskHolds('snapshot success streak');
      }
      return false;
    }
    bot.leave403SnapshotRecovery.streak = 0;
    bot.leave403SnapshotRecovery.lastErrorAt = t;
    bot.leave403SnapshotRecovery.lastError = String(detail.error || detail.message || '');
    return false;
  }

	  function confirmPendingExit(pending, state) {
	    const t = Date.now();
	    const detail = cloneForPendingExit(pending.lastResult || {}) || {};
	    stopMotionAfterExit('exit-confirmed');
	    detail.reason = detail.reason || pending.reason || '';
	    detail.summary = detail.summary || pending.summary || detail.reason || '';
	    detail.userId = detail.userId || pending.userId || getCurrentUserId() || null;
    detail.self = detail.self || pending.self || null;
    detail.attempted = Boolean(detail.attempted);
    detail.error = '';
    detail.exitPending = false;
	    detail.exitConfirmed = true;
	    detail.exitConfirmedAt = t;
	    detail.exitConfirmation = state || null;
	    detail.loginSnapshotGateReset = resetLoginSnapshotGate('exit-confirmed:' + (detail.reason || pending.reason || ''));
	    detail.pendingExitAgeMs = pending.at ? Math.max(0, Math.round(t - Number(pending.at || t))) : 0;
    detail.pendingExitRetryCount = Number(pending.retryCount || 0);
    const http403 = Boolean(state?.http403 || leaveDetailHasHttp403(detail));
    const suppressOptions = http403
      ? {
        minimumUntil: t + leave403ReloginDelayMs(),
        minimumReason: 'leave HTTP 403 risk control'
      }
      : {};
    if (http403) {
      detail.http403RiskControl = true;
      detail.riskControlReloginDelayMs = leave403ReloginDelayMs();
    }
	    bot.pendingCombatLeave = null;
	    bot.pendingInjuryLeave = null;
	    bot.pursuit = null;
	    if (bot.lastSafety) bot.lastSafety.pursuit = null;
	    clearCombatEngagement('exit-confirmed');
	    if (pending.scope === 'offline') {
	      setOfflineLeaveSuppress(detail.reason || 'websocket offline', detail, detail.self || pending.self || null, suppressOptions);
	    } else {
	      setEnemyLeaveSuppress(detail.reason || 'enemy leave', detail, detail.self || pending.self || detail.injury?.self || detail.injury || null, suppressOptions);
	      if (pending.source === 'combat') bot.lastCombatLeaveResult = detail;
	      if (pending.source === 'pursuit') bot.lastPursuitLeaveResult = detail;
	      if (pending.source === 'injury') bot.lastInjuryLeaveResult = detail;
	    }
    bot.pendingExit = null;
    recordExitAuditEvent('exit-confirmed', detail, {
      at: t,
      confirmedAt: t,
      confirmation: state || null,
      source: pending.source || detail.exitAuditSource || '',
      scope: pending.scope || detail.exitAuditScope || ''
    });
    return detail;
  }

  function pendingExitWaitReason(pending, confirmed = false) {
    if (confirmed) return pending.scope === 'offline' ? 'offline-leave-wait' : 'enemy-leave-wait';
    if (pending.scope === 'offline') return 'offline-leave';
    if (pending.source === 'pursuit') return 'pursuit-leave-retry';
    return 'combat-leave-retry';
  }

  function pendingExitWaitDecision(pending, self, leaveResult, state, confirmed = false) {
    const activeDetail = pending.scope === 'offline' ? activeOfflineLeaveDetail() : activeEnemyLeaveDetail();
    const currentSummary = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || bot.lastSelf || null));
    const cover = !confirmed && pending.source === 'combat' ? pending.combatCover : null;
    return {
      kind: 'wait',
      reason: pendingExitWaitReason(pending, confirmed),
      dx: cover ? clamp(Math.round(Number(cover.dx) || 0), -1, 1) : 0,
      dy: cover ? clamp(Math.round(Number(cover.dy) || 0), -1, 1) : 0,
      self: currentSummary,
      currentUserId: getCurrentUserId(),
      control: summarizeControl(),
      combat: Boolean(cover),
      shoot: Boolean(cover?.shoot),
      forceShoot: Boolean(cover?.forceShoot),
      shootEveryMs: cover?.shootEveryMs,
      target: cover?.target || pending.target || null,
      aimTarget: cover?.aimTarget || null,
      incomingBullet: cover?.incomingBullet || null,
      combatState: pending.combat || null,
      combatCover: cover || null,
      displayReason: leaveResult?.displayReason || activeDetail?.displayReason || pending.displayReason || '',
      leave: leaveResult,
      pendingExit: summarizePendingExit(bot.pendingExit || pending),
      exitConfirmation: state || null,
      holdRemainingMs: activeDetail?.holdRemainingMs ?? (pending.scope === 'offline' ? offlineReloginHoldRemainingMs() : enemyReloginHoldRemainingMs())
    };
  }

  function applyCombatExitCover(pending, self = null) {
    const cover = pending?.source === 'combat' ? pending.combatCover : null;
    if (!cover || !self || !isAlive(self)) return false;
    const action = {
      kind: 'wait',
      combat: true,
      dx: cover.dx,
      dy: cover.dy
    };
    sendActionVelocity(action);
    if (cover.shoot && cover.target && self) {
      shootAt(self, cover.aimTarget || cover.target, Boolean(cover.forceShoot), { shootEveryMs: cover.shootEveryMs });
    }
    return true;
  }

  async function retryPendingExit(pending, self, state) {
    const t = Date.now();
    const retryMs = pendingExitRetryMs(pending);
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    if (lastAttemptAt && t - lastAttemptAt < retryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - lastAttemptAt))),
        summary: pending.summary || '',
        displayReason: pending.displayReason || '',
        exitPending: true,
        exitConfirmed: false,
        pendingExit: summarizePendingExit(pending),
        exitConfirmation: state || null
      };
      return detail;
    }
    const detail = cloneForPendingExit(pending.lastResult || {}) || {};
    detail.at = t;
    detail.attempted = false;
    detail.method = '';
    detail.error = '';
    detail.reason = pending.reason || detail.reason || '';
    detail.summary = pending.summary || detail.summary || detail.reason || '';
    detail.userId = getCurrentUserId() || pending.userId || detail.userId || null;
    detail.self = state?.self || (self && isAlive(self) ? summarizeSelf(self) : (pending.self || detail.self || null));
    detail.offlineSafety = detail.offlineSafety || pending.offlineSafety || null;
    detail.target = detail.target || pending.target || null;
    detail.pursuit = detail.pursuit || pending.pursuit || null;
    detail.injury = detail.injury || pending.injury || null;
    detail.combat = detail.combat || pending.combat || null;
    detail.combatCover = detail.combatCover || pending.combatCover || detail.combat?.leaveCover || null;
    detail.exitPending = true;
    detail.exitConfirmed = false;
    detail.pendingExitRetry = true;
    detail.exitConfirmation = state || null;
    bot.pendingExit = {
      ...pending,
      updatedAt: t,
      lastAttemptAt: t,
      lastResult: cloneForPendingExit(detail)
    };
    detail.pendingExit = summarizePendingExit(bot.pendingExit);
    recordPendingExitResult(pending.source, detail, t);
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      rememberPendingExit(pending.scope, pending.source, detail, detail.self || pending.self || null);
    } else {
      const next = {
        ...pending,
        updatedAt: t,
        lastAttemptAt: t,
        retryCount: Number(pending.retryCount || 0) + 1,
        lastResult: cloneForPendingExit(detail)
      };
      bot.pendingExit = next;
      detail.pendingExit = summarizePendingExit(next);
      detail.displayReason = detail.displayReason || pending.displayReason || pendingExitDisplayReason(detail.summary || pending.summary || detail.reason);
    }
    recordPendingExitResult(pending.source, detail, t);
    return detail;
  }

  function schedulePendingExitRetry(pending, self, state) {
    if (!pending) return false;
    const t = Date.now();
    const retryMs = pendingExitRetryMs(pending);
    const lastAttemptAt = Number(pending.lastAttemptAt || 0);
    if (lastAttemptAt && t - lastAttemptAt < retryMs) return false;
    Promise.resolve()
      .then(() => retryPendingExit(pending, self, state))
      .catch(err => recordUnhandledTickError('pending-exit-retry', err));
    return true;
  }

  async function handlePendingExit(self) {
    const pending = bot.pendingExit;
    if (!pending) return null;
    const existingHoldMs = pending.scope === 'offline' ? offlineReloginHoldRemainingMs() : enemyReloginHoldRemainingMs();
    if (existingHoldMs > 0) {
      bot.pendingExit = null;
      return null;
    }
    const state = pendingExitSelfState(self);
    const lastDetail = pending.lastResult || {};
    if (leaveDetailHasHttp403(lastDetail)) {
      const detail = confirmPendingExit(pending, {
        ...state,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
      return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
    }
    if (leaveDetailSucceeded(lastDetail)) {
      const detail = confirmPendingExit(pending, {
        ...state,
        known: true,
        alive: false,
        source: 'leave-success',
        self: null
      });
      return pendingExitWaitDecision(pending, self, detail, detail.exitConfirmation, true);
    }
    const localState = pendingExitLocalConfirmationState(pending, self, state);
    if (localState.confirmed) {
      const detail = confirmPendingExit(pending, localState);
      return pendingExitWaitDecision(pending, self, detail, localState, true);
    }
    if (state.known && state.alive) {
      schedulePendingExitRetry(pending, self, state);
      return null;
    }
    if (state.known && !state.alive) {
      const lastError = String(pending.lastResult?.error || '');
      const weakConfirmation = /^(login-required|no-current-user-id)$/.test(String(state.source || ''));
      if (lastError && weakConfirmation) {
        bot.pursuit = null;
        if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-unconfirmed-auth-state');
        const detail = await retryPendingExit(pending, self, { ...state, weakConfirmation: true, ignoredBecauseLastLeaveError: lastError });
        return pendingExitWaitDecision(pending, self, detail, { ...state, weakConfirmation: true }, false);
      }
      const detail = confirmPendingExit(pending, state);
      return pendingExitWaitDecision(pending, self, detail, state, true);
    }
    bot.pursuit = null;
    if (!applyCombatExitCover(pending, self)) stopMotionSafely('pending-exit-confirmation');
    const detail = await retryPendingExit(pending, self, state);
    return pendingExitWaitDecision(pending, self, detail, state, false);
  }

	  function summarizePendingCombatLeave(pending = bot.pendingCombatLeave) {
	    if (!pending) return null;
	    return {
	      reason: pending.reason || '',
      exitSummary: pending.exitSummary || '',
      displayReason: pending.displayReason || '',
	      at: pending.at || 0,
	      ageMs: pending.at ? Math.max(0, Math.round(Date.now() - Number(pending.at || Date.now()))) : 0,
	      retryCount: Number(pending.retryCount || 0),
      target: pending.target || null,
      combatState: pending.combatState || null,
      lastResult: pending.lastResult || null
    };
  }

  function rememberPendingCombatLeave(action, selfSummary, leaveResult) {
    const previous = bot.pendingCombatLeave || {};
    const retryCount = Number(previous.retryCount || 0) + (leaveResult?.attempted || !previous.at ? 1 : 0);
    bot.pendingCombatLeave = {
      at: previous.at || Date.now(),
      lastRetryAt: Date.now(),
	      retryCount,
	      reason: action?.reason || previous.reason || 'combat-leave-retry',
      exitSummary: action?.exitSummary || previous.exitSummary || leaveResult?.exitSummary || leaveResult?.summary || '',
      displayReason: action?.displayReason || previous.displayReason || leaveResult?.displayReason || leaveResult?.summary || '',
	      target: action?.target || previous.target || null,
	      combatState: action?.combatState || previous.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || previous.combatCover || null,
      self: selfSummary || previous.self || null,
      lastResult: leaveResult || previous.lastResult || null
    };
    return bot.pendingCombatLeave;
  }

  function pendingCombatLeaveAction(pending = bot.pendingCombatLeave) {
    if (!pending) return null;
    return {
      kind: 'leave',
      reason: pending.reason || 'combat-leave-retry',
      combat: true,
      ignoreReturnBlock: true,
      dx: clamp(Math.round(Number(pending.combatCover?.dx) || 0), -1, 1),
      dy: clamp(Math.round(Number(pending.combatCover?.dy) || 0), -1, 1),
      shoot: Boolean(pending.combatCover?.shoot),
      forceShoot: Boolean(pending.combatCover?.forceShoot),
      shootEveryMs: pending.combatCover?.shootEveryMs,
      aimTarget: pending.combatCover?.aimTarget || null,
      exitSummary: pending.exitSummary || '',
      displayReason: pending.displayReason || pending.exitSummary || '',
	      target: pending.target || null,
      combatCover: pending.combatCover || null,
      combatState: pending.combatState || null
    };
  }

  function hasRecentCombatEngagementForInjuryLeave() {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return false;
    const maxAgeMs = Math.max(0, Number(cfg.targetStickMs || 0), Number(cfg.combatEngageStickMs || 0));
    if (!maxAgeMs) return true;
    return Date.now() - Number(engaged.at || 0) <= maxAgeMs;
  }

  function isCombatStateForInjuryLeave(action) {
    return Boolean(
      action?.combat
      || bot.pendingCombatLeave
      || bot.lastSafety?.engagedCombat
      || hasRecentCombatEngagementForInjuryLeave()
    );
  }

  function actionThreatId(action) {
    const threat = Array.isArray(action?.threats) ? action.threats[0] : null;
    return threat ? String(threat.id ?? threat.user_id ?? '') : '';
  }

	  function pursuitPressure(self, threat, previous, action) {
    if (!threat) return null;
    const distance = Number(threat.distance ?? dist(self, threat));
    if (!Number.isFinite(distance) || distance > cfg.pursuitTrackRadius) return null;
    const id = threatKey(threat);
    const vx = Number(threat.vx || 0);
    const vy = Number(threat.vy || 0);
    const s = Math.max(0, Number(threat.speed ?? speed(threat)) || 0);
    const tx = Number(self.x) - Number(threat.x);
    const ty = Number(self.y) - Number(threat.y);
    const d = Math.max(1, Math.hypot(tx, ty));
    const towardScore = s > 0 ? ((vx * tx) + (vy * ty)) / (s * d) : 0;
    const closingDistance = previous && String(previous.id) === id
      ? Number(previous.distance) - distance
      : 0;
    const actionMatches = actionThreatId(action) === id
      && (action?.kind === 'flee' || action?.reason === 'return-block-lateral-scan');
    const closePressure = distance <= Number(threat.threatRadius || cfg.dangerRadius);
    const cautionPressure = distance <= Number(threat.cautionRadius || cfg.activeCautionRadius) + cfg.activeCautionExitMargin;
    const towardPressure = cautionPressure && towardScore >= cfg.pursuitTowardCosMin;
    const closingPressure = cautionPressure && closingDistance >= cfg.pursuitClosingMinDistance;
    const returnBlockPressure = distance <= returnBlockRadius(threat);
    if (!closePressure && !towardPressure && !closingPressure && !actionMatches && !returnBlockPressure) return null;
    return {
      threat,
      id,
      score: (actionMatches ? 100000 : 0)
        + (closePressure ? 30000 : 0)
        + (returnBlockPressure ? 15000 : 0)
        + Math.max(0, towardScore) * 10000
        + Math.max(0, closingDistance)
        - distance / 10,
      reason: actionMatches ? 'bot-fleeing-from-threat'
        : closePressure ? 'inside-danger-radius'
          : returnBlockPressure ? 'return-block-pressure'
            : towardPressure ? 'moving-toward-self'
              : 'closing-distance',
      distance,
      speed: s,
      moving: Boolean(threat.moving),
      towardScore,
	      closingDistance
	    };
	  }

	  function pursuitLeaveThresholdFor(self, threat) {
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

	  function updatePursuitTracking(self, activeThreats, action) {
    const t = now();
    const previous = bot.pursuit;
    const candidates = (activeThreats || [])
      .map(threat => pursuitPressure(self, threat, previous, action))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const picked = candidates[0] || null;
    if (!picked) {
      if (previous && t - Number(previous.lastSeenAt || 0) <= cfg.pursuitLostGraceMs) {
        previous.active = false;
        previous.durationMs = Math.max(0, Number(previous.lastSeenAt || t) - Number(previous.startedAt || t));
        if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(previous);
        return previous;
      }
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
      return null;
    }
    const same = previous && String(previous.id) === String(picked.id)
      && t - Number(previous.lastSeenAt || t) <= cfg.pursuitLostGraceMs;
	    const startedAt = same ? Number(previous.startedAt || t) : t;
	    const thresholdMs = pursuitLeaveThresholdFor(self, picked.threat);
	    bot.pursuit = {
	      id: picked.id,
	      name: picked.threat.name || '',
      startedAt,
      lastSeenAt: t,
      durationMs: Math.max(0, t - startedAt),
      distance: picked.distance,
      speed: picked.speed,
      moving: picked.moving,
	      active: true,
	      reason: picked.reason,
	      towardScore: picked.towardScore,
	      closingDistance: picked.closingDistance,
	      thresholdMs,
	      invulnerable: isInvulnerable(picked.threat),
	      nonFullHp: !isFullHp(self)
	    };
    if (bot.lastSafety) bot.lastSafety.pursuit = summarizePursuit(bot.pursuit);
    return bot.pursuit;
  }

  function waitWithTimeout(promise, timeoutMs, label) {
    const ms = Math.max(100, Number(timeoutMs) || 0);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error((label || 'operation') + ' timed out after ' + ms + 'ms'));
      }, ms);
      Promise.resolve(promise).then(
        value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function leaveCommandFailureMessage(value) {
    if (value === false) return 'leave request returned false';
    if (!value || typeof value !== 'object') return '';
    if (value.ok === false || value.success === false) {
      return value.message || value.error || 'leave request returned failure';
    }
    if (value.error && value.ok !== true && value.success !== true) {
      return value.message || value.error || 'leave request returned error';
    }
    const status = Number(value.status || value.statusCode || 0);
    if (status >= 400) return value.statusText || value.message || ('leave request HTTP ' + status);
    return '';
  }

  function summarizeLeaveCommandResult(value) {
    if (value === undefined) return { type: 'undefined' };
    if (value === null) return { type: 'null' };
    if (value === false || value === true) return { type: 'boolean', value: Boolean(value) };
    if (typeof value !== 'object') return { type: typeof value, value: String(value).slice(0, 200) };
    return {
      type: Array.isArray(value) ? 'array' : 'object',
      ok: value.ok ?? null,
      success: value.success ?? null,
      status: value.status ?? value.statusCode ?? null,
      statusText: value.statusText || '',
      message: value.message || '',
      error: value.error || ''
    };
  }

  function updatePendingExitLastResult(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return;
    bot.pendingExit = {
      ...pending,
      updatedAt: Date.now(),
      lastAttemptAt: Number(detail.at || detail.lastLeaveRequest?.sentAt || pending.lastAttemptAt || Date.now()),
      lastResult: cloneForPendingExit(detail)
    };
  }

  function maybeConfirmPendingExitFromLeaveDetail(detail) {
    const pending = bot.pendingExit;
    if (!pending || !detail?.exitAuditId) return null;
    const pendingAuditId = pending.lastResult?.exitAuditId || '';
    if (pendingAuditId && pendingAuditId !== detail.exitAuditId) return null;
    const self = getSelf();
    const baseState = pendingExitSelfState(self);
    if (leaveDetailHasHttp403(detail)) {
      return confirmPendingExit(pending, {
        ...baseState,
        known: true,
        alive: false,
        source: 'leave-http-403',
        http403: true,
        self: null
      });
    }
    if (leaveDetailSucceeded(detail)) {
      return confirmPendingExit(pending, {
        ...baseState,
        known: true,
        alive: false,
        source: 'leave-success',
        self: null
      });
    }
    const localState = pendingExitLocalConfirmationState(pending, self, baseState);
    if (localState.confirmed) return confirmPendingExit(pending, localState);
    return null;
  }

  function completeLeaveRequest(detail, request, rawResult, errorMessage = '') {
    if (!detail || !request || request.completedAt) return detail;
    const failure = errorMessage || leaveCommandFailureMessage(rawResult);
    if (failure) detail.error = failure;
    detail.leaveRequestPending = false;
    request.completedAt = Date.now();
    request.durationMs = Math.max(0, Math.round(request.completedAt - request.sentAt));
    request.attempted = Boolean(detail.attempted);
    request.method = detail.method || '';
    request.error = detail.error || '';
	    request.result = summarizeLeaveCommandResult(rawResult);
	    request.pending = false;
	    if (!Array.isArray(detail.leaveRequests)) detail.leaveRequests = [];
	    detail.leaveRequests.push(request);
	    detail.leaveRequests = detail.leaveRequests.slice(-20);
	    detail.lastLeaveRequest = request;
	    if (leaveDetailSucceeded(detail) || leaveDetailHasHttp403(detail)) {
	      stopMotionAfterExit(leaveDetailHasHttp403(detail) ? 'leave-http-403' : 'leave-success');
	    }
	    updatePendingExitLastResult(detail);
	    recordExitAuditEvent('leave-request', detail, {
	      at: request.completedAt,
      request,
      source: detail.exitAuditSource || detail.reason || 'leave-command',
      scope: detail.exitAuditScope || ''
    });
    maybeConfirmPendingExitFromLeaveDetail(detail);
    return detail;
  }

  function issueLeaveCommand(detail) {
    if (bot.pendingExit && !detail?.pendingExitRetry) {
      const skipped = pendingExitSkipNewLeave(detail?.exitAuditSource || detail?.reason || 'leave-command', detail?.reason || '', detail || {});
      if (skipped) {
        Object.assign(detail, skipped);
        return detail;
      }
    }
    ensureExitAuditDetail(detail, {
      source: detail?.exitAuditSource || detail?.reason || 'leave-command',
      scope: detail?.exitAuditScope || ''
    });
    const request = {
      requestId: newExitAuditRequestId(detail.exitAuditId),
      exitAuditId: detail.exitAuditId || '',
      sentAt: Date.now(),
      completedAt: 0,
      durationMs: 0,
      attempted: false,
      method: '',
      error: '',
      result: null,
      pending: false
    };
	    try {
	      if (typeof leave === 'function') {
	        detail.attempted = true;
	        detail.method = detail.userId ? 'leave(userId)' : 'leave';
	        const result = detail.userId ? leave(detail.userId) : leave();
	        if (result && typeof result.then === 'function') {
          detail.leaveRequestPending = true;
          detail.leaveRequestSentAt = request.sentAt;
          detail.leaveRequestTimeoutMs = Math.max(1000, Number(cfg.leaveCommandTimeoutMs || 0) || 10000);
          request.attempted = true;
          request.method = detail.method;
          request.pending = true;
          detail.lastLeaveRequest = request;
          let settled = false;
          const timeoutMs = detail.leaveRequestTimeoutMs;
          const finish = (rawResult, errorMessage = '') => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            completeLeaveRequest(detail, request, rawResult, errorMessage);
          };
          const timer = setTimeout(() => {
            finish({ error: 'leave request timed out after ' + timeoutMs + 'ms' }, 'leave request timed out after ' + timeoutMs + 'ms');
          }, timeoutMs);
          Promise.resolve(result).then(
            value => finish(value, ''),
            err => finish({ error: err?.message || String(err) }, err?.message || String(err))
          );
          return detail;
	        }
        return completeLeaveRequest(detail, request, result, '');
	      } else {
	        const leaveBtn = document.querySelector('#leaveBtn');
	        if (leaveBtn && isVisible(leaveBtn)) {
	          detail.attempted = true;
	          detail.method = '#leaveBtn';
	          leaveBtn.click();
          return completeLeaveRequest(detail, request, undefined, '');
	        } else {
	          detail.error = 'leave control not found';
          return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	        }
	      }
	    } catch (err) {
	      detail.error = err?.message || String(err);
      return completeLeaveRequest(detail, request, { error: detail.error }, detail.error);
	    }
	    return detail;
	  }

  async function maybeStartAutoLogin(reason, options = {}) {
    const force = Boolean(options.force || options.immediate || options.manual);
    const ignoreSuppress = Boolean(options.ignoreSuppress || force);
    const ignoreLoginCooldown = Boolean(options.ignoreLoginCooldown || force);
    if (syncPausedFromPage()) {
      return {
        needed: false,
        attempted: false,
	        reason: 'paused',
	        error: '',
	        hasToken: Boolean(getSessionToken()),
	        currentUserId: getCurrentUserId(),
	        snapshotGate: snapshotLoginGateStatus()
	      };
    }
    if (!cfg.autoLogin || cfg.dryRun || cfg.once) return null;
    const t = Date.now();
    if (exitAuditFlushPending()) {
      const blocked = exitAuditFlushBlockDetail('login:' + (reason || ''));
      bot.exitAudit.lastBlockedLogin = blocked;
      flushCombatLogs(true);
      return {
        needed: true,
        attempted: false,
        reason: 'exit-log-flush-pending',
        cooldownRemainingMs: 0,
        error: '',
	        exitAuditFlush: blocked,
	        hasToken: Boolean(getSessionToken()),
	        hasNativeSession: false,
	        nativeWsReadyState: getNativeControl()?.wsReadyState ?? null,
	        currentUserId: getCurrentUserId(),
	        snapshotGate: snapshotLoginGateStatus()
	      };
    }
    const userId = getCurrentUserId();
    const hasToken = Boolean(getSessionToken());
    const native = getNativeControl();
    const hasNativeSession = hasNativeGameSession(native, userId);
    const loginControl = findLoginControl();
    const loginRequired = hasLoginRequiredText();
    const self = getSelf();
    const hasAliveSelf = Boolean(self && isAlive(self));
    const canStartLogin = Boolean(loginControl || typeof startLinuxDoLogin === 'function');
    const hasPageSession = Boolean(hasToken || hasNativeSession);
    const needsLogin = !hasAliveSelf && (loginRequired || !hasPageSession || (force && canStartLogin && !hasNativeSession));
    if (!needsLogin) {
      return force ? {
        needed: false,
        attempted: false,
        reason: hasAliveSelf ? 'already-alive' : (hasNativeSession ? 'game-session-active' : 'already-logged-in'),
        error: '',
        forced: true,
        hasToken,
        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus(),
	        self: hasAliveSelf ? summarizeSelf(self) : null
	      } : null;
	    }
    const suppressRemainingMs = loginSuppressRemainingMs();
    if (suppressRemainingMs > 0 && !ignoreSuppress) {
      return {
        needed: true,
        attempted: false,
        reason: 'suppressed',
        cooldownRemainingMs: Math.round(suppressRemainingMs),
        error: '',
        suppressReason: localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || 'login flow',
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus()
	      };
	    }
    if (!ignoreLoginCooldown && t - Number(bot.lastLoginAt || 0) < cfg.loginCooldownMs) {
      const lastError = bot.lastLoginResult?.error || '';
      return {
        needed: true,
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.loginCooldownMs - (t - Number(bot.lastLoginAt || 0)))),
        error: lastError,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId,
	        snapshotGate: snapshotLoginGateStatus()
	      };
	    }
	    const snapshotGate = await ensureLoginSnapshotGate(reason);
	    if (!snapshotGate.satisfied) {
	      return {
	        needed: true,
	        attempted: false,
	        reason: 'snapshot-gate',
	        cooldownRemainingMs: 0,
	        error: '',
	        snapshotGate,
	        hasToken,
	        hasNativeSession,
	        nativeWsReadyState: native?.wsReadyState ?? null,
	        currentUserId: userId
	      };
	    }
	    const detail = {
	      needed: true,
	      attempted: false,
      reason,
      hasToken,
      hasNativeSession,
      nativeWsReadyState: native?.wsReadyState ?? null,
      currentUserId: userId,
	      loginRequired,
	      forced: force,
	      ignoredSuppressMs: ignoreSuppress ? Math.round(suppressRemainingMs) : 0,
	      snapshotGate,
	      loginControl: loginControl ? (loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase())) : '',
      method: '',
      error: ''
    };
    bot.lastLoginAt = t;
    try {
      if (typeof startLinuxDoLogin === 'function') {
        const result = startLinuxDoLogin();
        if (result && typeof result.then === 'function') await result;
        detail.attempted = true;
        detail.method = 'startLinuxDoLogin';
      } else if (loginControl) {
        loginControl.click();
        detail.attempted = true;
        detail.method = loginControl.id ? '#' + loginControl.id : (controlText(loginControl) || loginControl.tagName.toLowerCase());
      } else {
        detail.error = 'login control not found';
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    if (detail.attempted && !detail.error) setLoginSuppress('bot login started', cfg.postLoginGraceMs);
    bot.lastLoginResult = detail;
    return detail;
  }

	  async function forceLoginNow(reason = 'panel immediate login') {
	    const manualReason = String(reason || 'panel immediate login');
	    const snapshotGate = await ensureLoginSnapshotGate(manualReason);
	    const snapshotBlocked = !snapshotGate.satisfied;
	    const cleared = snapshotBlocked
	      ? {
	        at: Date.now(),
	        reason: manualReason,
	        skipped: true,
	        skipReason: 'snapshot-gate',
	        snapshotGate
	      }
	      : exitAuditFlushPending()
	      ? {
	        at: Date.now(),
	        reason: manualReason,
        skipped: true,
        skipReason: 'exit-log-flush-pending',
	        exitAuditFlush: exitAuditFlushBlockDetail('manual-login:' + manualReason)
	      }
	      : clearCurrentReloginHold(manualReason);
	    bot.lastLoginAt = 0;
	    const login = snapshotBlocked
	      ? {
	        needed: true,
	        attempted: false,
	        reason: 'snapshot-gate',
	        error: '',
	        forced: true,
	        snapshotGate,
	        hasToken: Boolean(getSessionToken()),
	        hasNativeSession: hasNativeGameSession(getNativeControl(), getCurrentUserId()),
	        nativeWsReadyState: getNativeControl()?.wsReadyState ?? null,
	        currentUserId: getCurrentUserId()
	      }
	      : await maybeStartAutoLogin(manualReason, {
	        force: true,
	        ignoreSuppress: true,
	        ignoreLoginCooldown: true
	      });
    const detail = {
      at: Date.now(),
      reason: manualReason,
      cleared,
      login
    };
    bot.lastManualLoginResult = detail;
    bot.lastLoginResult = login || bot.lastLoginResult;
    bot.lastDecision = {
      kind: 'wait',
      reason: login?.attempted ? 'manual-login' : (login?.reason || 'manual-login'),
      dx: 0,
      dy: 0,
      self: getSelf() ? summarizeSelf(getSelf()) : bot.lastSelf,
      currentUserId: getCurrentUserId(),
      control: summarizeControl(),
      login,
      manualLogin: detail
    };
    updateBotPanel(bot.lastDecision);
    setTimeout(() => triggerNativeTick('manual-login', false), 0);
    return detail;
  }

  async function leaveOffline(reason, selfSummary = null, offlineSafety = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('offline', reason, {
      self: selfSummary,
      offlineSafety,
      summary: offlineLeaveSummary(reason, offlineSafety)
    });
    if (skipped) return skipped;
    const retryMs = Math.max(200, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    if (t - Number(bot.lastOfflineLeaveAt || 0) < retryMs) {
      const active = activeOfflineLeaveDetail(t);
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastOfflineLeaveAt || 0)))),
        offlineSafety,
        summary: active?.summary || offlineLeaveSummary(reason, offlineSafety),
        reloginUntil: active?.reloginUntil || bot.offlineReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastOfflineLeaveWaitMs || 0
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      offlineSafety,
      summary: offlineLeaveSummary(reason, offlineSafety),
      error: ''
    };
    startExitAudit(detail, { scope: 'offline', source: 'offline', reason, self: selfSummary, offlineSafety });
    bot.lastOfflineLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      const staminaSuppress = primePendingStaminaExitLoginSuppress(detail);
      if (!staminaSuppress && offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety)) {
        primePendingUnsafeExitLoginSuppress('offline leave', reason, detail, selfSummary);
      }
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('offline', 'offline', detail, selfSummary);
    }
    finalizeLeaveDisplayReason(detail);
    bot.lastOfflineLeaveResult = detail;
    return detail;
  }

  async function leaveForInjury(injury) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('injury', 'injury hp drop', {
      injury,
      summary: injuryLeaveSummary(injury)
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastInjuryLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastInjuryLeaveAt || 0)))),
        injury,
        summary: injuryLeaveSummary(injury)
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'injury hp drop',
      at: t,
      userId: getCurrentUserId() || null,
      injury,
      summary: injuryLeaveSummary(injury),
      error: ''
    };
    startExitAudit(detail, { scope: 'enemy', source: 'injury', reason: detail.reason, self: injury?.self || injury, injury });
    bot.lastInjuryLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppress('enemy leave', detail.reason, detail, injury?.self || injury);
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'injury', detail, injury?.self || injury);
      bot.pendingInjuryLeave = null;
    }
    bot.lastInjuryLeaveResult = detail;
    return detail;
  }

  async function leaveForPursuit(pursuit, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const pursuitSummary = summarizePursuit(pursuit);
    const skipped = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: pursuitLeaveSummary(pursuitSummary)
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastPursuitLeaveAt || 0) < cfg.pursuitLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.pursuitLeaveRetryMs - (t - Number(bot.lastPursuitLeaveAt || 0)))),
        pursuit: pursuitSummary,
        summary: pursuitLeaveSummary(pursuitSummary)
      };
      return finalizeLeaveDisplayReason(detail);
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'sustained pursuit',
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      pursuit: pursuitSummary,
      summary: pursuitLeaveSummary(pursuitSummary),
      error: ''
    };
    startExitAudit(detail, { scope: 'enemy', source: 'pursuit', reason: detail.reason, self: selfSummary, pursuit: pursuitSummary });
    bot.lastPursuitLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppress('enemy leave', detail.reason, detail, selfSummary);
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'pursuit', detail, selfSummary);
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
    }
    bot.lastPursuitLeaveResult = detail;
    return detail;
  }

  async function leaveForCombat(action, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const reason = action?.reason === 'combat-critical-hp-leave'
      ? 'combat critical hp'
      : action?.reason === 'combat-hp-disadvantage-leave'
        ? 'combat hp disadvantage'
        : action?.reason === 'combat-low-hp-no-damage-leave'
          ? 'combat low hp no damage'
          : 'combat low hp disadvantage';
    const skipped = pendingExitSkipNewLeave('combat', reason, {
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {})
    });
    if (skipped) return skipped;
    if (t - Number(bot.lastCombatLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastCombatLeaveAt || 0)))),
        combat: action?.combatState || null,
        combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
        target: action?.target || null,
        summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {})
      };
      finalizeLeaveDisplayReason(detail);
      rememberPendingCombatLeave(action, selfSummary, detail);
      return detail;
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      at: t,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      combatCover: action?.combatCover || action?.combatState?.leaveCover || null,
      summary: action?.exitSummary || combatExitSummary(action?.reason || 'combat-low-hp-leave', action?.target || null, action?.combatState || {}),
      error: ''
    };
    startExitAudit(detail, { scope: 'enemy', source: 'combat', reason, self: selfSummary, target: action?.target || null, combat: action?.combatState || null });
    bot.lastCombatLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted) {
      primePendingUnsafeExitLoginSuppress('enemy leave', detail.reason, detail, selfSummary);
    }
    if (detail.attempted || detail.exitAuditId) {
      rememberPendingExit('enemy', 'combat', detail, selfSummary);
      bot.pendingCombatLeave = null;
    } else {
      rememberPendingCombatLeave(action, selfSummary, detail);
    }
    bot.lastCombatLeaveResult = detail;
    return detail;
  }

  async function leaveDuringEnemyHold(reason = 'enemy leave wait') {
    const t = Date.now();
    const retryMs = Math.max(cfg.pursuitLeaveRetryMs, cfg.combatLeaveRetryMs);
    if (cfg.dryRun || cfg.once) return null;
    const skipped = pendingExitSkipNewLeave('enemy-hold-retry', reason, {
      summary: activeEnemyLeaveDetail(t)?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || ''
    });
    if (skipped) return skipped;
	    const active = activeEnemyLeaveDetail(t);
	    if (t - Number(bot.lastEnemyLeaveRetryAt || 0) < retryMs) {
	      const detail = {
	        attempted: false,
	        reason: 'cooldown',
	        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastEnemyLeaveRetryAt || 0)))),
	        holdRemainingMs: enemyReloginHoldRemainingMs(),
        summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
        reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
        reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0
	      };
      return finalizeLeaveDisplayReason(detail);
	    }
		    const detail = {
		      attempted: false,
		      method: '',
		      reason,
      at: t,
		      userId: getCurrentUserId() || null,
		      holdRemainingMs: enemyReloginHoldRemainingMs(),
      summary: active?.summary || bot.lastCombatLeaveResult?.summary || bot.lastPursuitLeaveResult?.summary || bot.lastInjuryLeaveResult?.summary || '',
      reloginUntil: active?.reloginUntil || bot.pursuitReloginUntil || 0,
      reloginDelayMs: active?.reloginDelayMs || bot.lastEnemyLeaveWaitMs || 0,
	      error: ''
	    };
    startExitAudit(detail, { scope: 'enemy', source: 'enemy-hold-retry', reason });
    bot.lastEnemyLeaveRetryAt = t;
    await issueLeaveCommand(detail);
	    if (detail.attempted && !detail.error) bot.pendingCombatLeave = null;
	    detail.holdRemainingMs = enemyReloginHoldRemainingMs();
    finalizeLeaveDisplayReason(detail);
	    bot.lastEnemyLeaveRetryResult = detail;
    return detail;
  }

	  function getNativeState() {
	    try {
	      return typeof state === 'object' && state ? state : null;
	    } catch (_) {
	      return null;
	    }
	  }

	  function getNativeControl() {
	    const nativeState = getNativeState();
	    if (!nativeState) return null;
	    const ws = nativeState.ws || null;
	    return {
	      state: nativeState,
	      ws,
	      wsOpen: Boolean(nativeState.wsOpen && ws && ws.readyState === WebSocket.OPEN),
	      wsReadyState: ws ? ws.readyState : null
	    };
	  }

  function wsConstant(name, fallback) {
    try {
      return typeof WebSocket !== 'undefined' && Number.isFinite(Number(WebSocket[name]))
        ? Number(WebSocket[name])
        : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function isOfflineishWsReadyState(value) {
    const state = wsReadyStateNumber(value);
    if (!Number.isFinite(state)) return false;
    return state === wsConstant('CONNECTING', 0)
      || state === wsConstant('CLOSING', 2)
      || state === wsConstant('CLOSED', 3);
  }

  function noteNativeReconnectState(native) {
    if (!native) return { count: 0, churn: false, windowMs: 0 };
    const control = bot.control;
    const t = Date.now();
    const windowMs = Math.max(1000, Number(cfg.offlineReconnectChurnWindowMs || 0) || 10000);
    const minEvents = Math.max(2, Number(cfg.offlineReconnectChurnMinEvents || 0) || 3);
    const readyState = wsReadyStateNumber(native.wsReadyState);
    const previousReadyState = wsReadyStateNumber(control.observedNativeWsReadyState);
    const previousWs = control.observedNativeWs || null;
    const wsChanged = Boolean(native.ws && previousWs && native.ws !== previousWs);
    const hadPrevious = Boolean(previousWs || Number.isFinite(previousReadyState));
    const wasOpen = previousReadyState === wsConstant('OPEN', 1);
    const offlineish = Boolean(!native.wsOpen && isOfflineishWsReadyState(readyState));
    const becameOfflineish = offlineish && (!hadPrevious || wsChanged || wasOpen || previousReadyState !== readyState);
    const events = Array.isArray(control.nativeReconnectEvents) ? control.nativeReconnectEvents : [];
    const freshEvents = events.filter(at => t - Number(at || 0) <= windowMs);
    if (becameOfflineish) freshEvents.push(t);
    control.nativeReconnectEvents = freshEvents;
    control.nativeReconnectEventCount = freshEvents.length;
    control.nativeReconnectWindowMs = windowMs;
	    control.nativeReconnectChurn = Boolean(freshEvents.length >= minEvents);
    control.observedNativeWs = native.ws || null;
    control.observedNativeWsReadyState = native.wsReadyState;
    return {
      count: control.nativeReconnectEventCount,
      churn: control.nativeReconnectChurn,
      windowMs
    };
  }

	  function detachNativeMessagePump() {
	    if (bot.nativeMessageWs) {
	      try {
	        if (bot.nativeMessageHandler) bot.nativeMessageWs.removeEventListener('message', bot.nativeMessageHandler);
	        if (bot.nativeOpenHandler) bot.nativeMessageWs.removeEventListener('open', bot.nativeOpenHandler);
	        if (bot.nativeCloseHandler) bot.nativeMessageWs.removeEventListener('close', bot.nativeCloseHandler);
	        if (bot.nativeErrorHandler) bot.nativeMessageWs.removeEventListener('error', bot.nativeErrorHandler);
	      } catch (_) {}
	    }
	    bot.nativeMessageWs = null;
	    bot.nativeMessageHandler = null;
	    bot.nativeOpenHandler = null;
	    bot.nativeCloseHandler = null;
	    bot.nativeErrorHandler = null;
	  }

	  function triggerNativeTick(source, respectMinInterval = true) {
	    if (!bot.running || bot.ticking) return;
	    const t = now();
	    if (respectMinInterval && t - bot.lastNativeTickAt < cfg.nativeTickMinMs) return;
	    bot.lastNativeTickAt = t;
	    runTickSafely(source);
	  }

	  function ensureNativeMessagePump(native = getNativeControl()) {
	    if (!native?.ws) return false;
	    if (bot.nativeMessageWs === native.ws && bot.nativeMessageHandler) return true;
	    detachNativeMessagePump();
	    bot.nativeMessageWs = native.ws;
	    bot.nativeMessageHandler = runCallbackSafely('native-ws-message', () => {
	      triggerNativeTick('native-ws', true);
	    });
	    bot.nativeOpenHandler = runCallbackSafely('native-ws-open', () => {
	      bot.control.lastOpenAt = Date.now();
	      bot.control.lastError = '';
	      triggerNativeTick('native-ws-open', false);
	    });
	    bot.nativeCloseHandler = runCallbackSafely('native-ws-close', () => {
	      bot.control.wsOpen = false;
	      bot.control.nativeWsOpen = false;
	      bot.control.wsReadyState = native.ws.readyState;
	      bot.control.nativeWsReadyState = native.ws.readyState;
	    });
	    bot.nativeErrorHandler = runCallbackSafely('native-ws-error', () => {
	      bot.control.lastError = 'native websocket error';
	    });
	    try {
	      native.ws.addEventListener('message', bot.nativeMessageHandler);
	      native.ws.addEventListener('open', bot.nativeOpenHandler);
	      native.ws.addEventListener('close', bot.nativeCloseHandler);
	      native.ws.addEventListener('error', bot.nativeErrorHandler);
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native pump: ' + (err.message || String(err));
	      detachNativeMessagePump();
	      return false;
	    }
	  }

	  function notePageOwnsReconnect() {
	    bot.control.lastError = 'native reconnect disabled; page owns websocket reconnect';
	    return false;
	  }

	  function syncNativeControl(native = getNativeControl()) {
	    if (!native) return false;
	    noteNativeReconnectState(native);
	    bot.control.transport = 'native-page';
	    bot.control.nativeWsOpen = native.wsOpen;
	    bot.control.nativeWsReadyState = native.wsReadyState;
	    bot.control.wsOpen = native.wsOpen;
	    bot.control.wsReadyState = native.wsReadyState;
	    bot.control.connecting = !native.wsOpen && native.wsReadyState === WebSocket.CONNECTING;
	    ensureNativeMessagePump(native);
	    if (native.wsOpen) {
	      if (!bot.control.lastOpenAt) bot.control.lastOpenAt = Date.now();
	      bot.control.lastError = '';
	    }
	    return native.wsOpen;
	  }

	  function summarizeControl() {
	    const control = bot.control;
	    const native = getNativeControl();
	    if (native) syncNativeControl(native);
	    const nativeState = native?.state || null;
    const serverPositionStall = summarizeServerPositionStall();
    const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
    const effectiveWsOpen = Boolean(control.wsOpen && !serverPositionStallOffline);
	    const nativeCurrentVel = nativeState?.currentVel
	      ? (Number(nativeState.currentVel.dx || 0) + ' ' + Number(nativeState.currentVel.dy || 0))
	      : '';
	    const nativeKeys = nativeState?.keys && typeof nativeState.keys[Symbol.iterator] === 'function'
	      ? Array.from(nativeState.keys)
	      : [];
	    return {
	      currentUserId: control.currentUserId || getCurrentUserId(),
	      hasToken: Boolean(getSessionToken()),
	      wsOpen: effectiveWsOpen,
      rawWsOpen: Boolean(control.wsOpen),
	      wsReadyState: native ? native.wsReadyState : (control.ws ? control.ws.readyState : control.wsReadyState),
	      connecting: Boolean(control.connecting),
	      transport: control.transport || (native ? 'native-page' : 'none'),
	      allowNativeReconnect: false,
	      allowBotWebSocketFallback: false,
	      nativeWsOpen: Boolean(native?.wsOpen),
	      nativeWsReadyState: native ? native.wsReadyState : null,
	      nativeReconnectChurn: Boolean(control.nativeReconnectChurn),
	      nativeReconnectEventCount: Number(control.nativeReconnectEventCount || 0),
	      nativeReconnectWindowMs: Number(control.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0),
	      lastOpenAgeMs: control.lastOpenAt ? Date.now() - control.lastOpenAt : null,
	      lastMessageAgeMs: control.lastMessageAt ? Date.now() - control.lastMessageAt : null,
	      lastError: serverPositionStallOffline
          ? 'server position stalled'
          : (control.lastError === 'server position stalled' ? '' : (control.lastError || '')),
	      lastVelocity: control.lastVelocity || '',
      nonZeroVelocityAgeMs: control.lastNonZeroVelocityAt ? Date.now() - Number(control.lastNonZeroVelocityAt || 0) : null,
      nonZeroVelocityDurationMs: control.nonZeroVelocitySince ? Date.now() - Number(control.nonZeroVelocitySince || 0) : null,
	      nativeCurrentVel,
	      nativeLastVel: nativeState?.lastVel || '',
	      nativeKeys,
      serverPositionStall
	    };
	  }

	  function closeControlWs(reason = '') {
	    const ws = bot.control.ws;
	    bot.control.ws = null;
	    bot.control.wsOpen = false;
	    bot.control.connecting = false;
	    bot.control.wsReadyState = ws ? ws.readyState : bot.control.wsReadyState;
	    if (reason) bot.control.lastError = reason;
	    if (ws) {
	      try {
	        ws.close();
	      } catch (_) {}
	    }
	  }

	  function ensureControlWs() {
	    if (cfg.dryRun) return true;
	    const userId = getCurrentUserId();
	    const token = getSessionToken();
	    bot.control.currentUserId = userId;
	    bot.control.hasToken = Boolean(token);
	    if (!userId) {
	      closeControlWs('missing user id');
	      return false;
	    }
	    const native = getNativeControl();
	    if (native) {
	      if (bot.control.ws) closeControlWs();
	      syncNativeControl(native);
	      if (bot.control.wsOpen) return true;
	      if (isWsConnectingOrOpen(native.wsReadyState)) return false;
	      bot.control.lastError = 'native page websocket offline; page owns reconnect';
	      return false;
	    }
	    if (!token) {
	      closeControlWs('missing login token');
	      return false;
	    }
	    if (bot.control.ws) closeControlWs('bot websocket fallback disabled');
	    bot.control.transport = 'native-page-missing';
	    bot.control.connecting = false;
	    bot.control.wsOpen = false;
	    bot.control.lastError = 'native page websocket unavailable';
	    return false;
	  }

	  function getSelf() {
	    const id = getCurrentUserId();
	    if (!id) return null;
	    const nativeSelf = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
	    if (nativeSelf && Number(nativeSelf.user_id) === id) return nativeSelf;
	    const nativeState = getNativeState();
	    const nativeEntities = Array.isArray(nativeState?.entities) ? nativeState.entities : null;
	    const nativeEntity = (nativeEntities || []).find(e => Number(e.user_id) === id);
	    if (nativeEntity) return nativeEntity;
	    if (nativeEntities) return null;
	    if (!snapshotSelfFreshEnough()) return null;
	    return (bot.globalState.entities || []).find(e => Number(e.user_id) === id) || null;
	  }

	  function getEntities() {
	    const nativeState = getNativeState();
	    if (Array.isArray(nativeState?.entities) && nativeState.entities.length) return nativeState.entities;
	    return bot.globalState.entities || [];
	  }

  function getNativeEntityList() {
    const nativeState = getNativeState();
    return Array.isArray(nativeState?.entities) ? nativeState.entities : null;
  }

  function listFromNativeCoinValue(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Map || value instanceof Set) return Array.from(value.values());
    if (value && typeof value === 'object') {
      if (Number.isFinite(firstFiniteNumber(value.x, value.pos_x, value.posX, value.world_x, value.worldX, value.coord_x, value.coordX, value.center_x, value.centerX, value.position?.x, value.pos?.x))) {
        return [value];
      }
      const values = Object.values(value);
      if (values.length && values.every(item => item && typeof item === 'object')) return values;
    }
    return null;
  }

  function addNativeCoinSource(sources, label, value, thisArg = null) {
    let sourceValue = value;
    if (typeof sourceValue === 'function') {
      try {
        sourceValue = sourceValue.call(thisArg);
      } catch (_) {
        return false;
      }
    }
    const list = listFromNativeCoinValue(sourceValue);
    if (!list) return false;
    sources.push({ label, list });
    return true;
  }

  function getNativeCoinSources() {
    const sources = [];
    const win = typeof window === 'object' && window ? window : null;
    try {
      addNativeCoinSource(
        sources,
        'render',
        typeof getRenderCoinDrops === 'function' ? getRenderCoinDrops : win?.getRenderCoinDrops,
        win
      );
    } catch (_) {}
    const nativeState = getNativeState();
    if (!nativeState) return sources;
    for (const key of ['coinDrops', 'coin_drops', 'renderCoinDrops', 'render_coin_drops', 'visibleCoinDrops', 'visible_coin_drops', 'coins', 'drops']) {
      addNativeCoinSource(sources, 'state.' + key, nativeState[key], nativeState);
    }
    for (const key of ['getRenderCoinDrops', 'getCoinDrops', 'getVisibleCoinDrops', 'getCoins']) {
      addNativeCoinSource(sources, 'state.' + key + '()', nativeState[key], nativeState);
    }
    for (const parentKey of ['latestSnapshot', 'latest_snapshot', 'lastSnapshot', 'last_snapshot', 'snapshot', 'currentSnapshot', 'current_snapshot']) {
      const parent = nativeState[parentKey];
      if (!parent || typeof parent !== 'object') continue;
      for (const key of ['coinDrops', 'coin_drops', 'coins', 'drops']) {
        addNativeCoinSource(sources, 'state.' + parentKey + '.' + key, parent[key], parent);
      }
    }
    return sources;
  }

  function getNativeCoinList() {
    const sources = getNativeCoinSources();
    const list = [];
    for (const source of sources) {
      for (const item of source.list) {
        list.push(item && typeof item === 'object' ? { ...item, nativeSource: item.nativeSource || source.label } : item);
      }
    }
    return list.length ? list : null;
  }

  function entityIdKey(entity) {
    const id = entity?.user_id ?? entity?.id;
    return id === undefined || id === null || id === '' ? '' : String(id);
  }

  function buildNativeEntityMeta(nativeEntities) {
    if (!Array.isArray(nativeEntities)) return { available: false, ids: new Set(), aliveIds: new Set() };
    const ids = new Set();
    const aliveIds = new Set();
    for (const entity of nativeEntities) {
      const key = entityIdKey(entity);
      if (!key) continue;
      ids.add(key);
      if (isAlive(entity)) aliveIds.add(key);
    }
    return { available: true, ids, aliveIds };
  }

  function snapshotDataAgeMs() {
    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
  }

  function snapshotDataFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotCoinStaleMs || 0);
  }

  function snapshotBulletFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotBulletStaleMs || 0);
  }

  function snapshotSelfFreshEnough() {
    return snapshotDataAgeMs() <= Number(cfg.snapshotSelfStaleMs || 0);
  }

  function entityFreshEnoughForOffense(entity) {
    return Boolean(entity?.native || !entity?.snapshot || snapshotDataFreshEnough());
  }

  function snapshotEntityAllowed(self, entity, nativeMeta) {
    if (!nativeMeta?.available) return true;
    const distance = self ? dist(self, entity) : Infinity;
    const authoritativeRadius = Math.max(
      Number(cfg.nativeEntityAuthoritativeRadius || 0),
      Number(cfg.combatAttackRange || 0),
      Number(cfg.attackRange || 0),
      Number(cfg.globalAttackMaxDistance || 0)
    );
    if (Number.isFinite(distance) && distance <= authoritativeRadius) return false;
    const key = entityIdKey(entity);
    if (key && nativeMeta.ids.has(key) && !nativeMeta.aliveIds.has(key)) return false;
    return true;
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  }

  function normalizeCoinDrop(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    const point = raw.position || raw.pos || raw.point || raw.coord || null;
    const x = firstFiniteNumber(raw.x, raw.pos_x, raw.posX, raw.world_x, raw.worldX, raw.coord_x, raw.coordX, raw.center_x, raw.centerX, point?.x);
    const y = firstFiniteNumber(raw.y, raw.pos_y, raw.posY, raw.world_y, raw.worldY, raw.coord_y, raw.coordY, raw.center_y, raw.centerY, point?.y);
    const amount = firstFiniteNumber(raw.amount, raw.value, raw.coins, raw.coin_amount, raw.coinAmount, raw.count, raw.num, raw.quantity, 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amount) || amount <= 0) return null;
    const dropId = raw.drop_id ?? raw.dropId ?? raw.id ?? raw.coin_id ?? raw.coinId;
    return {
      ...raw,
      drop_id: dropId ?? ('coord:' + Math.round(x) + ':' + Math.round(y) + ':' + amount),
      x,
      y,
      amount,
      snapshot: source === 'snapshot' || Boolean(raw.snapshot),
      native: source === 'native' || Boolean(raw.native)
    };
  }

  function coinDropKey(coin) {
    const id = coin?.drop_id ?? coin?.id ?? coin?.coin_id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + id;
    return 'xy:' + Math.round(Number(coin.x) || 0) + ':' + Math.round(Number(coin.y) || 0) + ':' + (Number(coin.amount) || 0);
  }

  function nativeViewRadiusCm() {
    const nativeState = getNativeState();
    const values = [
      nativeState?.viewRadiusCm,
      nativeState?.view_radius_cm,
      nativeState?.viewRadius,
      nativeState?.view_radius
    ];
    for (const value of values) {
      const radius = Number(value);
      if (Number.isFinite(radius) && radius > 0) return radius;
    }
    return 0;
  }

  function snapshotCoinLocalSuppressRadius() {
    return Math.max(
      0,
      Number(cfg.nativeCoinAuthoritativeRadius || 0),
      nativeViewRadiusCm()
    );
  }

  function snapshotCoinAllowed(self, coin) {
    const distance = self ? dist(self, coin) : Infinity;
    const suppressRadius = snapshotCoinLocalSuppressRadius();
    return !Number.isFinite(distance) || distance > suppressRadius;
  }

  function isSnapshotOnlyCoin(coin) {
    return Boolean(coin?.snapshot) && !coin?.native;
  }

  function snapshotCoinFreshEnough() {
    return snapshotDataFreshEnough();
  }

  function getCoins(self = null) {
    const nativeCoinSources = getNativeCoinSources();
    const nativeCoinList = [];
    for (const source of nativeCoinSources) {
      for (const item of source.list) {
        nativeCoinList.push(item && typeof item === 'object' ? { ...item, nativeSource: item.nativeSource || source.label } : item);
      }
    }
    const nativeCoins = Array.isArray(nativeCoinList)
      ? nativeCoinList.map(coin => normalizeCoinDrop(coin, 'native')).filter(Boolean)
      : [];
    const snapshotCoins = Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : [];
    const useSnapshotCoins = snapshotCoinFreshEnough();
    const byKey = new Map();
    const add = (raw, source) => {
      const coin = normalizeCoinDrop(raw, source);
      if (!coin) return;
      const key = coinDropKey(coin);
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...coin, snapshot: Boolean(previous.snapshot || coin.snapshot), native: Boolean(previous.native || coin.native) } : coin);
    };
    if (useSnapshotCoins) {
      for (const coin of snapshotCoins) {
        const normalized = normalizeCoinDrop(coin, 'snapshot');
        if (!normalized || !snapshotCoinAllowed(self, normalized)) continue;
        add(normalized, 'snapshot');
      }
    }
    for (const coin of nativeCoins) add(coin, 'native');
    const merged = Array.from(byKey.values());
    bot.lastCoinSourceSummary = {
      nativeSources: nativeCoinSources.map(source => ({ label: source.label, raw: arrayCount(source.list) })),
      nativeRaw: nativeCoinList.length,
      native: nativeCoins.length,
      snapshotRaw: snapshotCoins.length,
      snapshotFresh: Boolean(useSnapshotCoins),
      suppressRadius: Math.round(snapshotCoinLocalSuppressRadius()),
      merged: merged.length
    };
    return merged;
  }

  function normalizeBullet(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    let vx = Number(raw.vx ?? raw.velocity_x ?? raw.dx ?? NaN);
    let vy = Number(raw.vy ?? raw.velocity_y ?? raw.dy ?? NaN);
    if (!Number.isFinite(vx)) vx = 0;
    if (!Number.isFinite(vy)) vy = 0;
    const speedPerTick = Number(raw.speed_per_tick ?? raw.speedPerTick ?? raw.speed_per_server_tick ?? NaN);
    if (!(vx || vy)) {
      let dirX = Number(raw.dir_x_micros ?? raw.dirXMicros ?? raw.direction_x_micros ?? raw.dir_x ?? raw.dirX ?? NaN);
      let dirY = Number(raw.dir_y_micros ?? raw.dirYMicros ?? raw.direction_y_micros ?? raw.dir_y ?? raw.dirY ?? NaN);
      if (Number.isFinite(dirX) && Number.isFinite(dirY)) {
        const scale = Math.max(Math.abs(dirX), Math.abs(dirY)) > 10 ? 1000000 : 1;
        dirX /= scale;
        dirY /= scale;
        const speed = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : 500;
        vx = dirX * speed;
        vy = dirY * speed;
      }
    }
    const startX = Number(raw.start_x ?? raw.startX ?? raw.origin_x ?? raw.x ?? raw.pos_x);
    const startY = Number(raw.start_y ?? raw.startY ?? raw.origin_y ?? raw.y ?? raw.pos_y);
    if (!(vx || vy) && Number.isFinite(startX) && Number.isFinite(startY)) {
      const targetX = Number(raw.target_x ?? raw.targetX ?? raw.aim_x ?? raw.aimX);
      const targetY = Number(raw.target_y ?? raw.targetY ?? raw.aim_y ?? raw.aimY);
      const dx = targetX - startX;
      const dy = targetY - startY;
      const distance = Math.hypot(dx, dy);
      if (Number.isFinite(distance) && distance > 0.01) {
        const speed = Number.isFinite(speedPerTick) && speedPerTick > 0 ? speedPerTick : 500;
        vx = dx / distance * speed;
        vy = dy / distance * speed;
      }
    }
    let x = Number(raw.x ?? raw.pos_x ?? raw.head_x ?? raw.headX ?? NaN);
    let y = Number(raw.y ?? raw.pos_y ?? raw.head_y ?? raw.headY ?? NaN);
    const nowTick = Number(raw.local_now_tick ?? raw.now_tick ?? raw.tick ?? bot.globalState.tick ?? NaN);
    const createdTick = Number(raw.created_tick ?? raw.createdTick ?? NaN);
    if ((!Number.isFinite(x) || !Number.isFinite(y)) && Number.isFinite(startX) && Number.isFinite(startY)) {
      x = startX;
      y = startY;
      const speedValue = hypot(vx, vy);
      if (speedValue > 0.01 && Number.isFinite(nowTick) && Number.isFinite(createdTick)) {
        const rangeCm = Number(raw.range_cm ?? raw.rangeCm ?? raw.range ?? 15000);
        const ageTicks = Math.max(0, nowTick - createdTick);
        const travelled = Math.min(Number.isFinite(rangeCm) && rangeCm > 0 ? rangeCm : 15000, ageTicks * speedValue);
        x = startX + vx / speedValue * travelled;
        y = startY + vy / speedValue * travelled;
      }
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const expireTick = Number(raw.expire_tick ?? raw.expireTick ?? NaN);
    if (Number.isFinite(nowTick) && Number.isFinite(expireTick) && nowTick > expireTick + 1) return null;
    const ownerId = raw.ownerId ?? raw.owner_id ?? raw.owner_user_id ?? raw.source_user_id ?? raw.shooter_user_id ?? raw.user_id ?? raw.from_user_id ?? null;
    const id = raw.bullet_id ?? raw.id ?? raw.entity_id ?? (Math.round(x) + ':' + Math.round(y) + ':' + Math.round(vx) + ':' + Math.round(vy));
    return {
      ...raw,
      id,
      x,
      y,
      vx,
      vy,
      ownerId,
      speedPerTick: Number.isFinite(speedPerTick) ? speedPerTick : hypot(vx, vy),
      createdTick: Number.isFinite(createdTick) ? createdTick : null,
      expireTick: Number.isFinite(expireTick) ? expireTick : null,
      snapshot: source === 'snapshot' || Boolean(raw.snapshot),
      native: source === 'native' || Boolean(raw.native)
    };
  }

  function getBullets() {
    const nativeState = getNativeState();
    const nativeBullets = Array.isArray(nativeState?.bullets) ? nativeState.bullets : [];
    const snapshotBullets = Array.isArray(bot.globalState.bullets) ? bot.globalState.bullets : [];
    const useSnapshotBullets = snapshotBulletFreshEnough();
    const byKey = new Map();
    const add = (raw, source) => {
      const bullet = normalizeBullet(raw, source);
      if (!bullet) return;
      const key = String(bullet.id ?? (bullet.x + ':' + bullet.y + ':' + bullet.vx + ':' + bullet.vy));
      const previous = byKey.get(key);
      byKey.set(key, previous ? { ...previous, ...bullet, snapshot: Boolean(previous.snapshot || bullet.snapshot), native: Boolean(previous.native || bullet.native) } : bullet);
    };
    if (useSnapshotBullets) {
      for (const bullet of snapshotBullets) add(bullet, 'snapshot');
    }
    for (const bullet of nativeBullets) add(bullet, 'native');
    return Array.from(byKey.values());
  }

  function fetchJsonNoStore(url, timeoutMs = cfg.globalRefreshTimeoutMs) {
    const ms = Math.max(250, Number(timeoutMs) || cfg.globalRefreshTimeoutMs);
    const options = { cache: 'no-store' };
    let controller = null;
    let timer = 0;
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      options.signal = controller.signal;
    }
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          if (controller) controller.abort();
        } catch (_) {}
        reject(new Error(url + ' timed out after ' + ms + 'ms'));
      }, ms);
    });
    const request = fetch(url, options).then(res => {
      if (!res.ok) {
        const error = new Error(url + ' HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : ''));
        error.status = res.status;
        error.statusText = res.statusText || '';
        throw error;
      }
      return res.json();
    });
    return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  }

  function summarizeSelf(self) {
    const stamina = summarizeStamina(self);
    return {
      id: self.user_id,
      name: self.name,
      x: Math.round(Number(self.x) || 0),
      y: Math.round(Number(self.y) || 0),
      hp: self.hp,
      maxHp: Number(self.max_hp ?? self.maxHp ?? 0) || null,
      stamina5s: stamina.stamina5s,
      stamina5sLimit: stamina.stamina5sLimit,
      stamina1h: stamina.stamina1h,
      stamina1hLimit: stamina.stamina1hLimit,
      stamina1d: stamina.stamina1d,
      stamina1dLimit: stamina.stamina1dLimit,
      stamina,
      drop: dropValue(self),
      coins: Number(self.coins || 0),
      life: self.life,
      mode: self.current_join_mode
    };
  }

  function entityPoint(entity) {
    if (!entity) return null;
    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function pointDistance(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
  }

  function getSnapshotSelf() {
    const id = getCurrentUserId();
    if (!id) return null;
    return (bot.globalState.entities || []).find(entity => Number(entity.user_id) === Number(id)) || null;
  }

  function currentVelocityCommandActive() {
    const t = Date.now();
    const lastAt = Number(bot.control.lastNonZeroVelocityAt || 0);
    const since = Number(bot.control.nonZeroVelocitySince || 0);
    return Boolean(since && lastAt && t - lastAt <= Math.max(100, Number(cfg.serverPositionCommandFreshMs || 900)));
  }

  function summarizeServerPositionStall(state = bot.serverPositionStall) {
    if (!state) return null;
    return {
      active: Boolean(state.active),
      stalled: Boolean(state.stalled),
      reason: state.reason || '',
      stalledAt: state.stalledAt || 0,
      holdRemainingMs: state.stalledUntil ? Math.max(0, Math.round(Number(state.stalledUntil || 0) - Date.now())) : 0,
      ageMs: state.startedAt ? Math.max(0, Date.now() - Number(state.startedAt || 0)) : 0,
      movingMs: state.movingSince ? Math.max(0, Date.now() - Number(state.movingSince || 0)) : 0,
      clientMoved: Number.isFinite(Number(state.clientMoved)) ? Math.round(Number(state.clientMoved)) : null,
      serverMoved: Number.isFinite(Number(state.serverMoved)) ? Math.round(Number(state.serverMoved)) : null,
      gap: Number.isFinite(Number(state.gap)) ? Math.round(Number(state.gap)) : null,
      gapDelta: Number.isFinite(Number(state.gapDelta)) ? Math.round(Number(state.gapDelta)) : null,
      noServerMove: Boolean(state.noServerMove),
      snapshotAgeMs: Number.isFinite(Number(state.snapshotAgeMs)) ? Math.round(Number(state.snapshotAgeMs)) : null,
      client: state.client ? { x: Math.round(Number(state.client.x) || 0), y: Math.round(Number(state.client.y) || 0) } : null,
      server: state.server ? { x: Math.round(Number(state.server.x) || 0), y: Math.round(Number(state.server.y) || 0) } : null
    };
  }

  function resetServerPositionStall(reason = '') {
    if (bot.serverPositionStall) bot.serverPositionStall.reason = reason || 'reset';
    bot.serverPositionStall = null;
  }

  function assessServerPositionStall(self) {
    if (!cfg.serverPositionStallEnabled) {
      resetServerPositionStall('disabled');
      return null;
    }
    const t = Date.now();
    if (bot.serverPositionStall?.stalled && t < Number(bot.serverPositionStall.stalledUntil || 0)) {
      return summarizeServerPositionStall(bot.serverPositionStall);
    }
    const movingSince = Number(bot.control.nonZeroVelocitySince || 0);
    const commandActive = currentVelocityCommandActive();
    const client = entityPoint(self);
    const serverSelf = getSnapshotSelf();
    const server = entityPoint(serverSelf);
    const snapshotAgeMs = bot.globalState.snapshotRefreshedAt
      ? t - Number(bot.globalState.snapshotRefreshedAt || 0)
      : Infinity;
    const snapshotFresh = snapshotAgeMs <= Math.max(500, Number(cfg.serverPositionSnapshotMaxAgeMs || 2500));
    if (!commandActive || !client || !server || !snapshotFresh || !bot.control.wsOpen) {
      if (!commandActive || !bot.control.wsOpen) resetServerPositionStall(commandActive ? 'ws-offline' : 'not-moving');
      return summarizeServerPositionStall();
    }

    let state = bot.serverPositionStall;
    if (!state || !state.active || Number(state.movingSince || 0) !== movingSince) {
      state = {
        active: true,
        stalled: false,
        reason: 'tracking',
        startedAt: t,
        movingSince,
        clientOrigin: client,
        serverOrigin: server,
        baseGap: pointDistance(client, server),
        client,
        server,
        clientMoved: 0,
        serverMoved: 0,
        gap: pointDistance(client, server),
        gapDelta: 0,
        snapshotAgeMs
      };
      bot.serverPositionStall = state;
      return summarizeServerPositionStall(state);
    }

    const serverMoved = pointDistance(server, state.serverOrigin);
    const serverMoveMax = Math.max(0, Number(cfg.serverPositionServerMoveMax || 80));
    if (serverMoved > serverMoveMax) {
      state = {
        active: true,
        stalled: false,
        reason: 'server-moved',
        startedAt: t,
        movingSince,
        clientOrigin: client,
        serverOrigin: server,
        baseGap: pointDistance(client, server),
        client,
        server,
        clientMoved: 0,
        serverMoved: 0,
        gap: pointDistance(client, server),
        gapDelta: 0,
        snapshotAgeMs
      };
      bot.serverPositionStall = state;
      return summarizeServerPositionStall(state);
    }

    const clientMoved = pointDistance(client, state.clientOrigin);
    const gap = pointDistance(client, server);
    const gapDelta = Math.max(0, gap - Number(state.baseGap || 0));
    const movingMs = t - movingSince;
    const ageMs = t - Number(state.startedAt || t);
    const stallMs = Math.max(500, Number(cfg.serverPositionStallMs || 2500));
    const configuredNoMoveStallMs = Number(cfg.serverPositionNoMoveStallMs);
    const noMoveStallMs = Number.isFinite(configuredNoMoveStallMs) && configuredNoMoveStallMs > 0
      ? Math.max(stallMs, configuredNoMoveStallMs)
      : 0;
    const clientDiverged = movingMs >= stallMs
      && ageMs >= stallMs
      && clientMoved >= Math.max(0, Number(cfg.serverPositionClientMoveMin || 300))
      && serverMoved <= serverMoveMax
      && (gap >= Math.max(0, Number(cfg.serverPositionGapMin || 400))
        || gapDelta >= Math.max(0, Number(cfg.serverPositionGapMin || 400)));
    const noServerMove = noMoveStallMs > 0
      && movingMs >= noMoveStallMs
      && ageMs >= noMoveStallMs
      && serverMoved <= serverMoveMax;
    const stalled = clientDiverged || noServerMove;
    Object.assign(state, {
      stalled,
      reason: stalled ? (noServerMove ? 'server-position-no-move' : 'server-position-stalled') : 'tracking',
      stalledAt: stalled ? (state.stalledAt || t) : 0,
      stalledUntil: stalled ? Math.max(Number(state.stalledUntil || 0), t + Math.max(1000, Number(cfg.serverPositionStallHoldMs || 6000))) : 0,
      client,
      server,
      clientMoved,
      serverMoved,
      gap,
      gapDelta,
      noServerMove,
      snapshotAgeMs
    });
    if (stalled && cfg.serverPositionStallOfflineEnabled) {
      bot.control.lastError = 'server position stalled';
    } else if (bot.control.lastError === 'server position stalled') {
      bot.control.lastError = '';
    }
    return summarizeServerPositionStall(state);
  }

  function resetSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    const limit = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const base = Number.isFinite(remaining) ? remaining : null;
    session.stamina1dSpentBeforeSegment = 0;
    session.stamina1dSpentMs = 0;
    session.stamina1dSegmentStartedAt = dailyStaminaWindowStartAt(t);
    session.stamina1dSegmentBase = base;
    session.stamina1dLastRemaining = base;
    session.stamina1dLastLimit = Number.isFinite(limit) && limit > 0 ? limit : null;
  }

  function updateSessionStaminaStats(session, selfSummary, t = Date.now()) {
    const remaining = Number(selfSummary?.stamina1d ?? selfSummary?.stamina?.stamina1d ?? NaN);
    if (!Number.isFinite(remaining)) return;
    const limitRaw = Number(selfSummary?.stamina1dLimit ?? selfSummary?.stamina?.stamina1dLimit ?? NaN);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null;
    const dayStart = dailyStaminaWindowStartAt(t);
    let segmentStart = Number(session.stamina1dSegmentStartedAt || 0);
    let segmentBase = Number(session.stamina1dSegmentBase);
    if (!segmentStart || !Number.isFinite(segmentBase)) {
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = remaining;
      session.stamina1dLastRemaining = remaining;
      session.stamina1dLastLimit = limit;
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0);
      session.stamina1dSpentMs = Math.max(0, Number(session.stamina1dSpentMs || 0) || 0);
      return;
    }
    if (segmentStart !== dayStart) {
      const lastRemaining = Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : segmentBase;
      const previousSpent = Math.max(0, segmentBase - lastRemaining);
      session.stamina1dSpentBeforeSegment = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + previousSpent;
      session.stamina1dSegmentStartedAt = dayStart;
      session.stamina1dSegmentBase = limit || Math.max(remaining, 0);
      segmentStart = dayStart;
      segmentBase = Number(session.stamina1dSegmentBase);
    }
    const segmentSpent = Math.max(0, segmentBase - remaining);
    const totalSpent = Math.max(0, Number(session.stamina1dSpentBeforeSegment || 0) || 0) + segmentSpent;
    session.stamina1dSpentMs = Math.max(0, Math.round(totalSpent));
    session.stamina1dLastRemaining = remaining;
    session.stamina1dLastLimit = limit;
  }

  function updateSessionStats(selfSummary) {
    const t = Date.now();
    const session = bot.session || (bot.session = {});
    if (!selfSummary || selfSummary.life === 'Dead' || selfSummary.life === 'WaitingRevive') {
      if (session.startedAt && !session.missingSince) session.missingSince = t;
      return;
    }
    const userId = selfSummary.id ?? null;
    const coins = Number(selfSummary.coins || 0);
    const missingMs = session.missingSince ? t - Number(session.missingSince || 0) : 0;
    const reset = !session.startedAt
      || (userId !== null && session.userId !== null && String(session.userId) !== String(userId))
      || missingMs > Math.max(1000, Number(cfg.sessionResetMissingMs || 10000));
    if (reset) {
      session.startedAt = t;
      session.userId = userId;
      session.baseCoins = Number.isFinite(coins) ? coins : 0;
      session.coinsGained = 0;
      session.coinPickupTotal = 0;
      session.coinPickupKeys = [];
      session.kills = 0;
      resetSessionStaminaStats(session, selfSummary, t);
      session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
      session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
    } else if (session.userId === null && userId !== null) {
      session.userId = userId;
    }
    session.missingSince = 0;
    if (!Number.isFinite(Number(session.baseCoins))) session.baseCoins = Number.isFinite(coins) ? coins : 0;
    if (!Number.isFinite(Number(session.combatLogSentBase))) session.combatLogSentBase = Number(bot.combatLogging?.sent || 0) || 0;
    if (!Number.isFinite(Number(session.combatLogFailedBase))) session.combatLogFailedBase = Number(bot.combatLogging?.failed || 0) || 0;
    if (!Number.isFinite(Number(session.coinPickupTotal))) session.coinPickupTotal = 0;
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    const coinDiff = Math.max(0, Math.round((Number.isFinite(coins) ? coins : 0) - Number(session.baseCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    updateSessionStaminaStats(session, selfSummary, t);
    const killCount = bot.killHistory.filter(item => Number(item?.at || 0) >= Number(session.startedAt || 0)).length;
    session.kills = Math.max(Math.max(0, Number(session.kills || 0) || 0), killCount);
  }

  function summarizeSessionStats(selfSummary) {
    const session = bot.session || {};
    const startedAt = Number(session.startedAt || 0);
    const stoppedAt = Number(session.missingSince || 0) || 0;
    return {
      startedAt,
      uptimeMs: startedAt ? Math.max(0, (stoppedAt || Date.now()) - startedAt) : 0,
      uptimeStoppedAt: stoppedAt,
      baseCoins: Number.isFinite(Number(session.baseCoins)) ? Number(session.baseCoins) : null,
      coins: Number(selfSummary?.coins || 0),
      coinsGained: Math.max(0, Number(session.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      kills: Math.max(0, Number(session.kills || 0) || 0),
      stamina1dSpentMs: Math.max(0, Math.round(Number(session.stamina1dSpentMs || 0) || 0)),
      stamina1dSegmentStartedAt: Number(session.stamina1dSegmentStartedAt || 0) || 0,
      stamina1dLastRemaining: Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(session.stamina1dLastLimit)) ? Number(session.stamina1dLastLimit) : null,
      combatLogSent: Math.max(0, Math.round((Number(bot.combatLogging?.sent || 0) || 0) - (Number(session.combatLogSentBase || 0) || 0))),
      combatLogFailed: Math.max(0, Math.round((Number(bot.combatLogging?.failed || 0) || 0) - (Number(session.combatLogFailedBase || 0) || 0))),
      userId: session.userId ?? null
    };
  }

  function pushBounded(list, item, max) {
    list.push(item);
    while (list.length > max) list.shift();
  }

  function rememberAttack(self, target, actionKind) {
    if (!target) return;
    pushBounded(bot.attackHistory, {
      at: Date.now(),
      action: actionKind,
      id: target.id ?? target.user_id,
      name: target.name || '',
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      drop: Number(target.drop || 0),
      distance: Number(target.distance || 0),
      self: summarizeSelf(self)
    }, 80);
  }

  function rememberCombatEngagement(self, target, action) {
    if (!target) return;
    const id = target.id ?? target.user_id;
    if (id === null || id === undefined) return;
    const previous = bot.combatTarget;
    const same = previous && String(previous.id ?? '') === String(id);
    const t = Date.now();
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const currentHp = knownHpValue(target);
    const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
    const damaged = currentHp !== null && previousHp !== null && currentHp < previousHp - 0.01;
    const lastDamageAt = damaged
      ? t
      : (same ? Number(previous.lastDamageAt || previous.at || t) : t);
    const lastInRangeAt = targetDistance <= Number(cfg.combatAttackRange || 0)
      ? t
      : (same ? Number(previous.lastInRangeAt || previous.at || t) : t);
    bot.combatTarget = {
      id,
      at: t,
      firstSeenAt: same ? Number(previous.firstSeenAt || previous.at || t) : t,
      name: target.name || '',
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      hp: currentHp,
      displayHp: Number.isFinite(Number(target.hp)) ? Number(target.hp) : null,
      drop: Number(target.drop || 0),
      distance: targetDistance,
      reason: action?.reason || '',
      intent: action?.target?.combatIntent || action?.combatIntent || target.combatIntent || '',
      lastDamageAt,
      lastInRangeAt,
      lastDamageAmount: damaged ? Math.max(0, previousHp - currentHp) : Number(previous?.lastDamageAmount || 0),
      noDamageMs: Math.max(0, t - lastDamageAt),
      self: summarizeSelf(self)
    };
  }

  function clearCombatEngagement(reason = '') {
    if (!bot.combatTarget) return;
    bot.lastCombatTargetClear = { at: Date.now(), reason };
    bot.combatTarget = null;
    bot.combatAim = null;
  }

  function updateKillHistory(self) {
    const ownName = self?.name || '';
    if (!ownName || !document?.body) return;
    const lines = (document.body.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^(.+?) killed (.+)$/);
      if (!match || match[1] !== ownName) continue;
      const time = /^\\d{1,2}:\\d{2}:\\d{2}$/.test(lines[i - 1] || '') ? lines[i - 1] : '';
      const victim = match[2];
      const key = time + '|' + victim;
      if (bot.seenKillKeys.has(key)) continue;
      const attack = bot.attackHistory
        .slice()
        .reverse()
        .find(item => item.name === victim || String(item.id) === victim);
      pushBounded(bot.killHistory, {
        at: Date.now(),
        time,
        victim,
        drop: attack ? attack.drop : null,
        matchedAttack: Boolean(attack),
        attackDistance: attack ? attack.distance : null
      }, 40);
      bot.seenKillKeys.add(key);
      pushBounded(bot.seenKillKeysList, key, 120);
    }
  }

  function markRecentMovement(entities) {
    const t = now();
    const sampleMs = Math.max(1, Number(cfg.combatAimMotionSampleMs || 50));
    const decayMs = Math.max(sampleMs, Number(cfg.combatAimRecentMotionDecayMs || 900));
    for (const entity of entities) {
      const id = Number(entity.user_id);
      if (!id) continue;
      const x = Number(entity.x);
      const y = Number(entity.y);
      const previous = bot.seenEntities.get(id);
      let movedAt = previous?.movedAt || 0;
      let motionSampleSpeed = 0;
      let motionObservedSpeed = 0;
      if (previous
        && Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(Number(previous.x))
        && Number.isFinite(Number(previous.y))) {
        const elapsedMs = Math.max(sampleMs, t - Number(previous.seenAt || t));
        const delta = Math.hypot(x - Number(previous.x), y - Number(previous.y));
        motionSampleSpeed = delta * sampleMs / elapsedMs;
        const retained = Math.max(0, Number(previous.motionObservedSpeed || 0)) * Math.max(0, 1 - elapsedMs / decayMs);
        motionObservedSpeed = Math.max(motionSampleSpeed, retained);
        if (delta >= cfg.activeMoveMin) movedAt = t;
      }
      if (!previous && (Math.abs(Number(entity.vx) || 0) || Math.abs(Number(entity.vy) || 0))) {
        movedAt = t;
      }
      const motionAgeMs = movedAt ? Math.max(0, t - movedAt) : null;
      entity.motionSampleSpeed = motionSampleSpeed;
      entity.motionObservedSpeed = motionObservedSpeed;
      entity.motionAgeMs = motionAgeMs;
      entity.recentlyMoved = Boolean(movedAt && t - movedAt <= cfg.activeSeenMs);
      bot.seenEntities.set(id, { x, y, seenAt: t, movedAt, motionSampleSpeed, motionObservedSpeed });
    }
    for (const [id, seen] of bot.seenEntities.entries()) {
      if (t - seen.seenAt > 10000) bot.seenEntities.delete(id);
    }
  }

	  async function refreshGlobalState(force = false) {
	    const t = Date.now();
	    if (!force && t - bot.globalState.refreshedAt < cfg.globalRefreshMs) return;
	    bot.globalState.refreshedAt = t;
	    const [snapshotRes, minimapRes] = await Promise.allSettled([
	      fetchJsonNoStore('/snapshot'),
	      fetchJsonNoStore('/minimap')
	    ]);
	    const errors = [];
	    if (snapshotRes.status === 'fulfilled') {
	      const snapshot = snapshotRes.value;
	      bot.globalState.tick = Number(snapshot?.tick || bot.globalState.tick || 0);
	      bot.globalState.entities = snapshot?.entities || [];
	      bot.globalState.bullets = snapshot?.bullets || [];
	      bot.globalState.coinDrops = snapshot?.coin_drops || [];
		      bot.globalState.messages = snapshot?.messages || [];
		      bot.globalState.snapshotRefreshedAt = Date.now();
		      noteLoginSnapshotProbe(true, { tick: bot.globalState.tick });
		      noteLeave403SnapshotProbe(true, { tick: bot.globalState.tick });
		    } else {
		      const message = snapshotRes.reason?.message || String(snapshotRes.reason || '');
		      errors.push('snapshot: ' + message);
		      noteLoginSnapshotProbe(false, { error: message });
		      noteLeave403SnapshotProbe(false, { error: message });
		    }
	    if (minimapRes.status === 'fulfilled') {
	      bot.globalState.minimap = minimapRes.value || null;
	    } else {
	      errors.push('minimap: ' + (minimapRes.reason?.message || String(minimapRes.reason || '')));
	    }
	    bot.globalState.error = errors.join('; ');
	  }

	  function wsSend(message) {
	    if (cfg.dryRun) return true;
	    const native = getNativeControl();
	    if (native) {
	      if (!syncNativeControl(native)) {
	        notePageOwnsReconnect();
	        return false;
	      }
	      try {
	        native.ws.send(message);
	        bot.control.lastMessageAt = Date.now();
	        return true;
	      } catch (err) {
	        bot.control.lastError = 'native send: ' + (err.message || String(err));
	        return false;
	      }
	    }
	    if (!ensureControlWs()) return false;
	    return false;
	  }

	  function setNativeKeys(nativeState, dx, dy) {
	    if (!nativeState?.keys || typeof nativeState.keys.add !== 'function') return false;
	    for (const key of ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']) {
	      nativeState.keys.delete(key);
	    }
	    if (dx < 0) nativeState.keys.add('a');
	    if (dx > 0) nativeState.keys.add('d');
	    if (dy < 0) nativeState.keys.add('w');
	    if (dy > 0) nativeState.keys.add('s');
	    if (nativeState.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	    }
	    return true;
	  }

	  function cancelVelocityStopTimer() {
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    bot.velocityPulseToken += 1;
	  }

	  function clearNativeMotionState(nativeState) {
	    if (!nativeState) return false;
	    setNativeKeys(nativeState, 0, 0);
	    const vectorFields = ['currentVel', 'targetVel', 'velocity'];
	    for (const field of vectorFields) {
	      const value = nativeState[field];
	      if (value && typeof value === 'object') {
	        if ('dx' in value) value.dx = 0;
	        if ('dy' in value) value.dy = 0;
	        if ('x' in value) value.x = 0;
	        if ('y' in value) value.y = 0;
	      }
	    }
	    if (nativeState.lastVel && typeof nativeState.lastVel === 'object') {
	      if ('dx' in nativeState.lastVel) nativeState.lastVel.dx = 0;
	      if ('dy' in nativeState.lastVel) nativeState.lastVel.dy = 0;
	      if ('x' in nativeState.lastVel) nativeState.lastVel.x = 0;
	      if ('y' in nativeState.lastVel) nativeState.lastVel.y = 0;
	    } else if (Object.prototype.hasOwnProperty.call(nativeState, 'lastVel')) {
	      nativeState.lastVel = '0 0';
	    }
	    if (nativeState.touchMove) {
	      nativeState.touchMove.active = false;
	      nativeState.touchMove.dx = 0;
	      nativeState.touchMove.dy = 0;
	    }
	    return true;
	  }

	  function stopLocalMotionOnly(reason = '') {
	    cancelVelocityStopTimer();
	    const nativeState = getNativeState();
	    if (nativeState) clearNativeMotionState(nativeState);
	    bot.control.lastVelocity = '0 0';
	    bot.control.lastVelocityAt = now();
	    bot.control.nonZeroVelocitySince = 0;
    bot.control.lastNonZeroVelocityAt = 0;
    if (reason !== 'server-position-stalled') resetServerPositionStall(reason || 'local-stop');
    if (reason) bot.control.lastLocalStopReason = reason;
    return true;
  }

	  function stopMotionSafely(reason = '') {
	    const native = getNativeControl();
	    if (native?.wsOpen) {
	      bot.control.lastVelocity = '0 0';
	      bot.control.lastVelocityAt = now();
	      const sent = sendNativeVelocity(0, 0, true);
	      stopLocalMotionOnly(reason);
	      return Boolean(sent);
	    }
	    return stopLocalMotionOnly(reason);
	  }

	  function stopMotionAfterExit(reason = 'exit-confirmed') {
	    stopMotionSafely(reason);
	    bot.lastExitMotionStopAt = Date.now();
	    bot.lastExitMotionStopReason = reason;
	    return true;
	  }

	  function sendNativeVelocity(dx, dy, force = false) {
	    const native = getNativeControl();
	    if (!native) return false;
	    setNativeKeys(native.state, dx, dy);
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    if (typeof sendVelocity !== 'function') return wsSend('vel ' + dx + ' ' + dy);
	    try {
	      sendVelocity(Boolean(force));
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native velocity: ' + (err.message || String(err));
	      return false;
	    }
	  }

	  function safeSendVelocity(dx, dy, force = false) {
	    dx = clamp(Math.round(dx), -1, 1);
	    dy = clamp(Math.round(dy), -1, 1);
	    if (cfg.dryRun) return true;
	    const vel = dx + ' ' + dy;
	    const t = now();
	    if (!force && vel === bot.control.lastVelocity && t - bot.control.lastVelocityAt < 100) return true;
	    bot.control.lastVelocity = vel;
	    bot.control.lastVelocityAt = t;
    if (dx || dy) {
      const dt = Date.now();
      if (!bot.control.nonZeroVelocitySince) bot.control.nonZeroVelocitySince = dt;
      bot.control.lastNonZeroVelocityAt = dt;
    } else {
      bot.control.nonZeroVelocitySince = 0;
      bot.control.lastNonZeroVelocityAt = 0;
      if (!bot.serverPositionStall?.stalled || !cfg.serverPositionStallOfflineEnabled) resetServerPositionStall('zero-velocity');
    }
	    if (sendNativeVelocity(dx, dy, force)) return true;
	    return wsSend('vel ' + vel);
	  }

	  function sendActionVelocity(action) {
	    const dx = clamp(Math.round(Number(action?.dx || 0)), -1, 1);
	    const dy = clamp(Math.round(Number(action?.dy || 0)), -1, 1);
	    bot.velocityPulseToken += 1;
	    const token = bot.velocityPulseToken;
	    if (bot.velocityStopTimer) {
	      clearTimeout(bot.velocityStopTimer);
	      bot.velocityStopTimer = 0;
	    }
	    const sent = safeSendVelocity(dx, dy, true);
	    const pulseMs = Number(action?.precisionPulseMs || 0);
	    const canPulse = pulseMs > 0
	      && (dx || dy)
	      && (action?.kind === 'coin' || action?.kind === 'seek-coin');
	    if (canPulse) {
	      const pulseMaxMs = Math.max(110, Number(cfg.precisionPulseMaxMs || 260));
	      bot.velocityStopTimer = setTimeout(() => {
	        try {
	          if (bot.velocityPulseToken !== token) return;
	          bot.velocityStopTimer = 0;
	          stopMotionSafely('precision-pulse');
	        } catch (err) {
	          recordUnhandledTickError('precision-pulse', err);
	        }
	      }, clamp(Math.round(pulseMs), 20, pulseMaxMs));
	    }
	    return sent;
	  }

	  function aimAt(target) {
	    if (!target) return;
	    const x = Math.round(Number(target.x) || 0);
	    const y = Math.round(Number(target.y) || 0);
	    bot.lastAim = { x, y };
	    const nativeState = getNativeState();
	    if (nativeState) {
	      nativeState.pointerWorld = { x, y };
	      nativeState.pointerSeen = true;
	    }
	  }

	  function sendNativeShoot(self, target) {
	    const native = getNativeControl();
	    if (!native) return false;
	    if (!syncNativeControl(native)) {
	      notePageOwnsReconnect();
	      return false;
	    }
	    aimAt(target);
	    if (typeof shoot !== 'function') return false;
	    try {
	      Promise.resolve(shoot()).catch(err => {
	        bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      });
	      bot.control.lastMessageAt = Date.now();
	      return true;
	    } catch (err) {
	      bot.control.lastError = 'native shoot: ' + (err.message || String(err));
	      return false;
	    }
	  }

  function shootAt(self, target, force = false, options = {}) {
    if (!target) return false;
    const t = now();
    const shootEveryMs = Number(options.shootEveryMs ?? cfg.shootEveryMs);
    if (!force && t - bot.lastShotAt < shootEveryMs) return false;
    bot.lastShotAt = t;
    aimAt(target);
    if (sendNativeShoot(self, target)) return true;
    const startX = Math.round(Number(self.x) || 0);
    const startY = Math.round(Number(self.y) || 0);
    return wsSend('shoot ' + Math.round(target.x) + ' ' + Math.round(target.y) + ' ' + startX + ' ' + startY);
  }

  function directionTo(self, target, tolerance = 250) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    return {
      dx: absX > tolerance ? Math.sign(dxRaw) : 0,
      dy: absY > tolerance ? Math.sign(dyRaw) : 0,
      distance: hypot(dxRaw, dyRaw)
    };
  }

  function coinAxisApproachDirection(dxRaw, dyRaw, distance, tolerance = cfg.coinPrecisionTolerance, lock = null) {
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    const minDistance = Math.max(0, Number(cfg.coinAxisApproachMinDistance || cfg.nearCoinStuckDistance || 0));
    if (Math.max(absX, absY) <= minDistance) return null;
    const baseRatio = Math.max(1, Number(cfg.coinAxisApproachRatio || 1));
    const laneTolerance = Math.max(tolerance, Number(cfg.coinAxisApproachLaneTolerance || 0));
    const xLocked = lock && lock.dx && !lock.dy;
    const yLocked = lock && lock.dy && !lock.dx;
    const xRatio = xLocked ? Math.max(1, baseRatio * 0.75) : baseRatio;
    const yRatio = yLocked ? Math.max(1, baseRatio * 0.75) : baseRatio;
    if (absX > tolerance && absX > absY && (absY <= laneTolerance || absX >= absY * xRatio)) {
      return { dx: Math.sign(dxRaw), dy: 0, distance, axisApproach: 'x' };
    }
    if (absY > tolerance && absY > absX && (absX <= laneTolerance || absY >= absX * yRatio)) {
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

  function coinPickupFailureCount(id, t = now()) {
    if (!id && id !== 0) return 0;
    const failure = bot.coinFailures.get(String(id));
    if (!failure) return 0;
    const lastAt = Number(failure.lastAt || 0);
    if (lastAt && t - lastAt > Number(cfg.coinFailureDecayMs || 0)) return 0;
    return Math.max(0, Math.floor(Number(failure.count || 0)));
  }

  function coinPickupAttemptSlowCount(id, distance, t = now()) {
    if (!id && id !== 0) return 0;
    if (Number(distance) > Number(cfg.closeCoinStuckDistance || 0)) return 0;
    const progress = bot.coinProgress;
    if (!progress || String(progress.id) !== String(id)) return 0;
    const lastImprovedAt = Number(progress.lastImprovedAt || progress.startedAt || t);
    const everyMs = Math.max(1, Number(cfg.coinPickupAttemptSlowEveryMs || 2500));
    const maxCount = Math.max(0, Math.floor(Number(cfg.coinPickupAttemptSlowMaxCount || 0)));
    return clamp(Math.floor(Math.max(0, t - lastImprovedAt) / everyMs), 0, maxCount);
  }

  function coinAxisLockShouldHold(lock, dxRaw, dyRaw) {
    if (!lock || !(lock.dx || lock.dy)) return false;
    const axisRaw = lock.dx ? dxRaw : dyRaw;
    const axisSign = lock.dx || lock.dy;
    const brakeDistance = Math.max(cfg.coinPrecisionTolerance, Number(cfg.coinApproachBrakeDistance || cfg.coinAxisFlipTolerance || 0));
    return Math.sign(axisRaw) === axisSign && Math.abs(axisRaw) > brakeDistance;
  }

  function coinNearApproachAxis(dxRaw, dyRaw, absX, absY, tolerance) {
    const brakeDistance = Math.max(tolerance, Number(cfg.coinApproachBrakeDistance || cfg.coinAxisFlipTolerance || 0));
    if (absX >= absY) {
      if (absX <= brakeDistance && absY > tolerance) return { dx: 0, dy: Math.sign(dyRaw) };
      return { dx: absX > tolerance ? Math.sign(dxRaw) : 0, dy: 0 };
    }
    if (absY <= brakeDistance && absX > tolerance) return { dx: Math.sign(dxRaw), dy: 0 };
    return { dx: 0, dy: absY > tolerance ? Math.sign(dyRaw) : 0 };
  }

  function coinDirectionTo(self, target, tolerance = cfg.coinPrecisionTolerance) {
    const dxRaw = Number(target.x) - Number(self.x);
    const dyRaw = Number(target.y) - Number(self.y);
    const absX = Math.abs(dxRaw);
    const absY = Math.abs(dyRaw);
    const distance = hypot(dxRaw, dyRaw);
    const t = now();
    const id = String(target.drop_id ?? target.id ?? '');
    const lock = bot.coinApproachLock;
    const sameLock = lock && lock.id === id && t < Number(lock.until || 0) && (lock.dx || lock.dy);
    const exactTolerance = Math.max(0, Number(cfg.coinPickupExactTolerance ?? 0) || 0);
    const exactDirection = () => ({
      dx: absX > exactTolerance ? Math.sign(dxRaw) : 0,
      dy: absY > exactTolerance ? Math.sign(dyRaw) : 0
    });

    if (distance <= cfg.coinPickupSweepDistance) {
      const pulse = Math.max(60, Number(cfg.coinPickupPulseMs) || 180);
      const pickupFailureCount = coinPickupFailureCount(id, t);
      const pickupAttemptSlowLevel = coinPickupAttemptSlowCount(id, distance, t);
      const pickupSlowCount = pickupFailureCount + pickupAttemptSlowLevel;
      const precisionPulseMs = coinPickupPrecisionPulseMs(distance, pickupSlowCount);
      const locked = (next, extra = {}) => {
        if (next.dx || next.dy) {
          bot.coinApproachLock = { id, dx: next.dx, dy: next.dy, until: t + pulse };
          return {
            ...next,
            distance,
            pickupSweep: true,
            locked: Boolean(sameLock),
            precisionPulseMs,
            pickupFailureCount,
            pickupAttemptSlowCount: pickupAttemptSlowLevel,
            ...extra
          };
        }
        if (bot.coinApproachLock?.id === id) bot.coinApproachLock = null;
        return { dx: 0, dy: 0, distance, pickupSweep: true, ...extra };
      };
      const dominantAxis = () => coinNearApproachAxis(dxRaw, dyRaw, absX, absY, tolerance);
      const direct = exactDirection();
      if (direct.dx || direct.dy) {
        return locked(direct, {
          exactTarget: true,
          pickupMicro: distance <= cfg.coinPickupMicroDistance,
          pickupFine: distance > cfg.coinPickupMicroDistance && distance <= cfg.coinPickupFineDistance,
          pushThrough: true
        });
      }

      if (distance <= cfg.coinPickupMicroDistance) {
        return locked({ dx: 0, dy: 0 }, { pickupMicro: true, exactTarget: true });
      }

      if (distance <= cfg.coinPickupFineDistance) {
        if (Math.floor(t / pulse) % 4 === 3) return locked({ dx: 0, dy: 0 }, { pickupFine: true });
        return locked(dominantAxis(), { pickupFine: true, pushThrough: true });
      }

      if (Math.floor(t / pulse) % 3 === 2) return locked({ dx: 0, dy: 0 });
      return locked(dominantAxis());
    }

    if (distance <= tolerance) {
      bot.coinApproachLock = null;
      return { dx: 0, dy: 0, distance };
    }
    const axisApproach = coinAxisApproachDirection(dxRaw, dyRaw, distance, tolerance, sameLock ? lock : null);
    if (axisApproach) {
      bot.coinApproachLock = { id, dx: axisApproach.dx, dy: axisApproach.dy, until: t + cfg.coinApproachLockMs };
      return { ...axisApproach, locked: Boolean(sameLock) };
    }
    if (distance <= cfg.nearCoinStuckDistance && Math.max(absX, absY) > tolerance) {
      if (sameLock) {
        if (coinAxisLockShouldHold(lock, dxRaw, dyRaw)) {
          return { dx: lock.dx, dy: lock.dy, distance, locked: true };
        }
        bot.coinApproachLock = null;
      }
      const next = coinNearApproachAxis(dxRaw, dyRaw, absX, absY, tolerance);
      if (!(next.dx || next.dy)) return { dx: 0, dy: 0, distance, braking: true };
      bot.coinApproachLock = { id, dx: next.dx, dy: next.dy, until: t + cfg.coinApproachLockMs };
      return { ...next, distance };
    }
    if (distance <= cfg.nearCoinStuckDistance) {
      const next = coinNearApproachAxis(dxRaw, dyRaw, absX, absY, tolerance);
      if (!(next.dx || next.dy)) return { dx: 0, dy: 0, distance, braking: true };
      bot.coinApproachLock = { id, dx: next.dx, dy: next.dy, until: t + cfg.coinApproachLockMs };
      return { ...next, distance };
    }
    bot.coinApproachLock = null;
    return {
      dx: absX > tolerance ? Math.sign(dxRaw) : 0,
      dy: absY > tolerance ? Math.sign(dyRaw) : 0,
      distance
    };
  }

  function coinMotionMeta(dir) {
    const meta = {};
    if (dir?.precisionPulseMs) meta.precisionPulseMs = Math.round(Number(dir.precisionPulseMs));
    const pickupFailureCount = Math.max(0, Math.floor(Number(dir?.pickupFailureCount || 0)));
    const pickupAttemptSlowCount = Math.max(0, Math.floor(Number(dir?.pickupAttemptSlowCount || 0)));
    if (pickupFailureCount) meta.pickupFailureCount = pickupFailureCount;
    if (pickupAttemptSlowCount) meta.pickupAttemptSlowCount = pickupAttemptSlowCount;
    if (pickupFailureCount || pickupAttemptSlowCount) meta.pickupSlowCount = pickupFailureCount + pickupAttemptSlowCount;
    if (dir?.pickupMicro) meta.pickupMode = dir.crossSweep ? 'micro-cross-sweep' : 'micro';
    else if (dir?.pickupFine) meta.pickupMode = 'fine';
    else if (dir?.pickupSweep) meta.pickupMode = 'sweep';
    else if (dir?.axisApproach) meta.routeMode = 'axis-approach-' + dir.axisApproach;
    if (dir?.locked) meta.motionLocked = true;
    if (dir?.pushThrough) meta.pushThrough = true;
    if (dir?.braking) meta.routeMode = 'coin-brake';
    return meta;
  }

  function fleeDirection(self, threats) {
    let vx = 0;
    let vy = 0;
    for (const t of threats) {
      const d = Math.max(1, dist(self, t));
      const weight = (cfg.dangerRadius - Math.min(cfg.dangerRadius, d) + 600) / d;
      vx += (Number(self.x) - Number(t.x)) * weight / d;
      vy += (Number(self.y) - Number(t.y)) * weight / d;
    }
    const nearest = threats[0] || null;
    let dx = Math.abs(vx) > 0.02 ? Math.sign(vx) : 0;
    let dy = Math.abs(vy) > 0.02 ? Math.sign(vy) : 0;
    if (!(dx || dy) && nearest) {
      dx = Math.sign(Number(self.x) - Number(nearest.x)) || 0;
      dy = Math.sign(Number(self.y) - Number(nearest.y)) || 0;
    }
    return {
      dx,
      dy,
      score: hypot(vx, vy)
    };
  }

  function lockedFleeDirection(self, threats, reason) {
    const t = now();
    const ids = threats.slice(0, 4).map(item => String(item.user_id ?? item.id ?? ''));
    if (bot.fleeLock && t < bot.fleeLock.until && (bot.fleeLock.dx || bot.fleeLock.dy)) {
      const previousIds = new Set(bot.fleeLock.threatIds || []);
      const overlaps = ids.some(id => previousIds.has(id));
      if (bot.fleeLock.reason === reason && (overlaps || threats.length)) {
        return { dx: bot.fleeLock.dx, dy: bot.fleeLock.dy, score: bot.fleeLock.score || 0, locked: true };
      }
    }

    const flee = fleeDirection(self, threats);
    if (!(flee.dx || flee.dy) && bot.fleeLock && (bot.fleeLock.dx || bot.fleeLock.dy)) {
      flee.dx = bot.fleeLock.dx;
      flee.dy = bot.fleeLock.dy;
    }
    bot.fleeLock = {
      dx: flee.dx,
      dy: flee.dy,
      score: flee.score,
      reason,
      threatIds: ids,
      until: t + cfg.fleeLockMs
    };
    return { ...flee, locked: false };
  }

  function actionMovesTowardThreat(self, threat, action) {
    const dx = Number(action?.dx || 0);
    const dy = Number(action?.dy || 0);
    if (!(dx || dy)) return false;
    const tx = Number(threat.x) - Number(self.x);
    const ty = Number(threat.y) - Number(self.y);
    return dx * tx + dy * ty > 0;
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
    return Boolean(pickReturnBlockPressure(activeThreats));
  }

  function markReturnBlockPressure(threat, force = false) {
    if (!threat) return;
    bot.returnBlockRecentThreatId = threatKey(threat);
    if (force || threat.distance <= returnBlockSuppressRadius(threat)) {
      bot.returnBlockCooldownUntil = Math.max(Number(bot.returnBlockCooldownUntil || 0), now() + cfg.returnBlockCooldownMs);
    }
  }

  function pickReturnBlockPressure(activeThreats) {
    const t = now();
    const recentId = bot.returnBlockRecentThreatId || bot.returnBlockLock?.id || '';
    if (recentId) {
      const recent = activeThreats.find(threat => threatKey(threat) === String(recentId));
      if (recent && recent.distance <= returnBlockSuppressRadius(recent)) {
        return recent;
      }
      if (t >= Number(bot.returnBlockCooldownUntil || 0)) {
        bot.returnBlockRecentThreatId = '';
      }
    }
    return activeThreats.find(e => e.distance <= returnBlockSuppressRadius(e)) || null;
  }

  function returnBlockScanDirection(self, activeThreats, nearbyHumans) {
    const t = now();
    const threat = pickReturnBlockPressure(activeThreats) || activeThreats[0] || null;
    const key = threatKey(threat);
    const locked = bot.returnBlockScan;
    if (locked && t < Number(locked.until || 0) && (locked.dx || locked.dy)) {
      const moved = Math.hypot(Number(self.x) - Number(locked.x || self.x), Number(self.y) - Number(locked.y || self.y));
      const stale = t - Number(locked.startedAt || t) >= cfg.returnBlockScanStuckMs && moved < cfg.returnBlockScanStuckDistance;
      if (!stale && (!key || String(locked.threatId || '') === key)) {
        return { dx: locked.dx, dy: locked.dy, locked: true, threat };
      }
    }

    const awayX = threat ? Math.sign(Number(self.x) - Number(threat.x)) : 0;
    const awayY = threat ? Math.sign(Number(self.y) - Number(threat.y)) : 0;
    const phase = Math.floor(t / cfg.returnBlockScanHeadingMs) % 8;
    const pattern = [
      { dx: -awayY, dy: awayX },
      { dx: awayY, dy: -awayX },
      { dx: awayX, dy: 0 },
      { dx: 0, dy: awayY },
      { dx: awayX, dy: awayY },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ];
    const candidates = pattern
      .map((item, index) => ({ dx: Math.sign(item.dx || 0), dy: Math.sign(item.dy || 0), index }))
      .filter(item => item.dx || item.dy)
      .filter(item => !threat || !actionMovesTowardThreat(self, threat, item));
    const scored = candidates.map(item => {
      let score = item.index === phase ? 500 : 0;
      if (threat) {
        const tx = Number(self.x) - Number(threat.x);
        const ty = Number(self.y) - Number(threat.y);
        score += item.dx * tx + item.dy * ty >= 0 ? 200 : -1000;
      }
      for (const human of (nearbyHumans || []).slice(0, 6)) {
        const hx = Number(self.x) - Number(human.x);
        const hy = Number(self.y) - Number(human.y);
        score += item.dx * hx + item.dy * hy >= 0 ? 5 : -20;
      }
      if (locked && item.dx === -Number(locked.dx || 0) && item.dy === -Number(locked.dy || 0)) score -= 30;
      return { ...item, score };
    }).sort((a, b) => b.score - a.score);
    const next = scored[0] || { dx: awayX || 1, dy: awayY || 0, score: 0 };
    bot.returnBlockScan = {
      threatId: key,
      dx: next.dx,
      dy: next.dy,
      x: Number(self.x) || 0,
      y: Number(self.y) || 0,
      startedAt: t,
      until: t + cfg.returnBlockScanHeadingMs
    };
    return { dx: next.dx, dy: next.dy, locked: false, threat };
  }

  function buildReturnBlockScanAction(self, activeThreats, nearbyHumans) {
    const dir = returnBlockScanDirection(self, activeThreats, nearbyHumans);
    const threat = dir.threat || activeThreats[0] || null;
    markReturnBlockPressure(threat);
    return {
      kind: 'patrol',
      reason: 'return-block-lateral-scan',
      dx: dir.dx,
      dy: dir.dy,
      locked: dir.locked,
      threats: threat ? [{
        id: threat.user_id,
        name: threat.name,
        d: Math.round(threat.distance),
        drop: threat.drop,
        speed: Math.round(threat.speed),
        moving: Boolean(threat.moving),
        r: Math.round(returnBlockRadius(threat)),
        exitR: Math.round(returnBlockExitRadius(threat)),
        resumeR: Math.round(returnBlockResumeRadius(threat))
      }] : []
    };
  }

  function threatKey(threat) {
    return String(threat?.user_id ?? threat?.id ?? '');
  }

  function pickReturnBlockThreat(self, activeThreats, action) {
    const lock = bot.returnBlockLock;
    if (lock?.id) {
      const locked = activeThreats.find(threat => threatKey(threat) === String(lock.id));
      if (locked && locked.distance <= returnBlockExitRadius(locked)) {
        return { threat: locked, locked: true, mode: 'exit' };
      }
      if (locked && locked.distance <= returnBlockResumeRadius(locked) && actionMovesTowardThreat(self, locked, action)) {
        return { threat: locked, locked: true, mode: 'resume-guard' };
      }
      bot.returnBlockLock = null;
    }
    const threat = activeThreats.find(e => e.distance <= returnBlockExitRadius(e));
    if (!threat) {
      const returnThreat = activeThreats.find(e => e.distance <= returnBlockResumeRadius(e) && actionMovesTowardThreat(self, e, action));
      if (!returnThreat) return null;
      bot.returnBlockLock = { id: threatKey(returnThreat), startedAt: now() };
      return { threat: returnThreat, locked: false, mode: 'resume-guard' };
    }
    bot.returnBlockLock = { id: threatKey(threat), startedAt: now() };
    return { threat, locked: false, mode: 'exit' };
  }

  function blockThreatReturnAction(self, activeThreats, action) {
    if (action?.ignoreReturnBlock || action?.combat || action?.kind === 'leave') return action;
    if (isFullHp(self) && !(activeThreats || []).some(isInvulnerableActive)) return action;
    if (!action || action.kind === 'flee' || action.kind === 'recover' || action.kind === 'wait' || action.kind === 'idle') return action;
    const picked = pickReturnBlockThreat(self, activeThreats, action);
    if (!picked) return action;
    const threat = picked.threat;
    if (isShortSafeCoinAction(action) && !actionMovesTowardThreat(self, threat, action)) return action;
    if (action.reason === 'return-block-lateral-scan'
      && threat.distance > returnBlockRadius(threat)
      && !actionMovesTowardThreat(self, threat, action)) {
      markReturnBlockPressure(threat);
      return action;
    }
    if (threat.distance > threat.threatRadius && !actionMovesTowardThreat(self, threat, action)) {
      markReturnBlockPressure(threat);
      const dir = returnBlockScanDirection(self, [threat], []);
      return {
        kind: 'patrol',
        reason: 'return-block-lateral-scan',
        dx: dir.dx,
        dy: dir.dy,
        locked: dir.locked,
        blockedAction: {
          kind: action.kind,
          reason: action.reason || '',
          target: action.target || null,
          returnBlockMode: picked.mode || ''
        },
        threats: [{
          id: threat.user_id,
          name: threat.name,
          d: Math.round(threat.distance),
          drop: threat.drop,
          speed: Math.round(threat.speed),
          moving: Boolean(threat.moving),
          r: Math.round(returnBlockRadius(threat)),
          exitR: Math.round(returnBlockExitRadius(threat)),
          resumeR: Math.round(returnBlockResumeRadius(threat))
        }]
      };
    }
    markReturnBlockPressure(threat, true);
    const flee = lockedFleeDirection(self, [threat], 'active-threat-return-block');
    return {
      kind: 'flee',
      reason: 'active-threat-return-block',
      dx: flee.dx,
      dy: flee.dy,
      locked: flee.locked,
      blockedAction: {
        kind: action.kind,
        reason: action.reason || '',
        target: action.target || null,
        returnBlockLocked: Boolean(picked.locked),
        returnBlockMode: picked.mode || ''
      },
      threats: [{
        id: threat.user_id,
        name: threat.name,
        d: Math.round(threat.distance),
        drop: threat.drop,
        speed: Math.round(threat.speed),
        moving: Boolean(threat.moving),
        r: Math.round(returnBlockRadius(threat)),
        exitR: Math.round(returnBlockExitRadius(threat)),
        resumeR: Math.round(returnBlockResumeRadius(threat))
      }]
    };
  }

  function classify(self) {
    const nativeEntities = getNativeEntityList();
    const nativeMeta = buildNativeEntityMeta(nativeEntities);
    const coinDrops = getCoins(self);
    const bullets = getBullets();
    const localSource = nativeMeta.available ? nativeEntities : [];
    const localEntities = (localSource || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id) && isAlive(e))
      .map(e => ({ ...e, native: Boolean(nativeMeta.available), snapshot: !nativeMeta.available || Boolean(e.snapshot) }));
    markRecentMovement(localEntities);
    const globalById = new Map();
    for (const entity of bot.globalState.entities || []) {
      if (Number(entity.user_id) === Number(self.user_id) || !isAlive(entity)) continue;
      if (!snapshotEntityAllowed(self, entity, nativeMeta)) continue;
      globalById.set(Number(entity.user_id), { ...entity, snapshot: true, native: false });
    }
    for (const entity of localEntities) {
      const previous = globalById.get(Number(entity.user_id)) || {};
      globalById.set(Number(entity.user_id), {
        ...previous,
        ...entity,
        native: Boolean(entity.native || previous.native),
        snapshot: Boolean(entity.snapshot || previous.snapshot)
      });
    }
    const entities = Array.from(globalById.values());
    const offensiveEntities = entities.filter(entityFreshEnoughForOffense);
    const attackableEntities = offensiveEntities.filter(e => !isWhitelistedTarget(e));
    const activeThreats = entities
      .filter(e => isCurrentlyActive(e))
      .map(e => decorateActiveThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const inactiveTargets = attackableEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .filter(e => e.distance <= cfg.attackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
	    const coins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.coinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
	    const allCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const globalTargets = attackableEntities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), global: true }))
      .filter(e => e.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const minimapDropTargets = (snapshotDataFreshEnough() ? (bot.globalState.minimap?.points || []) : [])
      .filter(p => Number(p.u) !== Number(self.user_id))
      .map(p => ({
        user_id: p.u,
        x: Number(p.x),
        y: Number(p.y),
        drop: Number(p.d || 0),
        distance: dist(self, p),
        global: true,
        minimapOnly: true
      }))
      .filter(p => !isWhitelistedTarget(p))
      .filter(p => p.drop > 0 && p.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
	    const globalCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.globalCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
	    const patrolCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.patrolCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
	    const scanCoins = coinDrops
	      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: Boolean(c.snapshot) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.scanCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
	    const nearbyHumans = entities
	      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
	      .sort((a, b) => a.distance - b.distance);
    const combatTargets = attackableEntities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e), knownHp: knownHpValue(e) }))
      .filter(e => !isInvulnerable(e))
      .filter(e => !nativeMeta.available || e.native)
      .filter(e => e.distance <= cfg.combatAttackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget?.kind === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget?.kind === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (isCurrentlyActive(a) !== isCurrentlyActive(b)) return isCurrentlyActive(a) ? -1 : 1;
        return a.distance - b.distance;
      });
	    const snapshotCoins = allCoins.filter(c => isSnapshotOnlyCoin(c) && c.distance <= cfg.snapshotCoinMaxDistance);
	    return { entities, activeThreats, inactiveTargets, coins, allCoins, snapshotCoins, globalTargets, minimapDropTargets, globalCoins, patrolCoins, scanCoins, nearbyHumans, combatTargets, bullets };
	  }

  function summarizeOfflineThreat(entity) {
    if (!entity) return null;
    return {
      id: entity.user_id ?? entity.id ?? null,
      name: entity.name || '',
      distance: Number.isFinite(Number(entity.distance)) ? Math.round(Number(entity.distance)) : null,
      drop: Number(entity.drop ?? dropValue(entity) ?? 0) || 0,
      speed: Number.isFinite(Number(entity.speed ?? speed(entity))) ? Math.round(Number(entity.speed ?? speed(entity))) : null,
      moving: Boolean(entity.moving || speed(entity) >= cfg.activeSpeedMin),
      mode: entity.current_join_mode || ''
    };
  }

  function assessOfflineSafety(self) {
    if (!self || !isAlive(self)) {
      return { unsafe: true, reason: 'no-self', nearestActive: null, nearestHuman: null };
    }
    const { activeThreats, nearbyHumans, combatTargets, bullets } = classify(self);
    const bullet = incomingBulletThreat(self, null, bullets);
    const dangerThreat = activeThreats.find(entity => entity.distance <= entity.threatRadius) || null;
    const cautionThreat = activeThreats.find(entity => entity.distance <= entity.cautionRadius + cfg.activeCautionExitMargin) || null;
    const returnBlockThreat = activeThreats.find(entity => entity.distance <= returnBlockRadius(entity)) || null;
    const combatThreat = combatTargets.find(entity => !isAfkProfitTarget(entity) && entity.distance <= cfg.combatAttackRange) || null;
    const passiveDangerRadius = Math.max(0, Number(cfg.offlinePassiveDangerRadius || cfg.passivePanicRadius || 0));
    const closeHuman = nearbyHumans.find(entity => entity.distance <= passiveDangerRadius) || null;
    const injury = bot.pendingInjuryLeave;
    const recentInjury = injury && Date.now() - Number(injury.at || 0) <= Math.max(3000, cfg.combatStrafeLockMs * 4);
    const picked = dangerThreat || bullet || recentInjury || combatThreat || cautionThreat || returnBlockThreat || closeHuman || null;
    const reason = dangerThreat ? 'active threat in danger range'
      : bullet ? 'incoming bullet'
        : recentInjury ? 'recent injury'
          : combatThreat ? 'combat target nearby'
            : cautionThreat ? 'active threat in caution range'
              : returnBlockThreat ? 'active return-block pressure'
                : closeHuman ? 'near player'
                  : 'clear';
    const safety = {
      unsafe: Boolean(picked),
      reason,
      passiveDangerRadius,
      nearestActive: summarizeOfflineThreat(activeThreats[0]),
      nearestHuman: summarizeOfflineThreat(nearbyHumans[0]),
      threat: summarizeOfflineThreat(picked && picked.user_id !== undefined ? picked : null),
      incomingBullet: bullet ? {
        id: bullet.id,
        ownerId: bullet.ownerId,
        distance: Math.round(Number(bullet.distance || 0)),
        laneDistance: Math.round(Number(bullet.laneDistance || 0))
      } : null,
      recentInjury: recentInjury ? injury : null
    };
    bot.lastOfflineSafety = safety;
    return safety;
  }

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

	  function safeCoinCandidates(coins, activeThreats, maxDistance, self = null) {
	    const t = now();
	    for (const [id, until] of bot.ignoredCoins.entries()) {
	      if (until <= t) bot.ignoredCoins.delete(id);
	    }
	    return (coins || []).map(c => ({
	      ...c,
	      distance: Number.isFinite(Number(c?.distance)) ? Number(c.distance) : (self ? dist(self, c) : Number(c?.distance))
	    })).filter(c => c.distance <= maxDistance
	      && !bot.ignoredCoins.has(String(c.drop_id))
	      && !activeThreats.some(t => coinBlockedByThreat(self, c, t)))
	      .sort(compareCoinOpportunity);
	  }

	  function pickRealtimeLocalCoin(self, coins, activeThreats) {
	    const radius = snapshotCoinLocalSuppressRadius();
	    if (!(radius > 0)) return null;
	    return safeCoinCandidates((coins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, radius, self)
	      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))[0] || null;
	  }

	  function nearestRealtimeCoinWithin(self, allCoins, activeThreats, maxDistance) {
	    if (!(Number(maxDistance) > 0)) return null;
	    return safeCoinCandidates((allCoins || []).filter(coin => !isSnapshotOnlyCoin(coin)), activeThreats, maxDistance, self)
	      .filter(coin => Number(coin.amount || 0) > 0)
	      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))
	      .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)
	        || Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
	  }

	  function fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, fieldCoin = null) {
	    const blockDistance = Math.max(0, Number(cfg.fieldMigrationNearbyCoinBlockDistance || 0));
	    if (!(blockDistance > 0)) return false;
	    const nearby = nearestRealtimeCoinWithin(self, allCoins, activeThreats, blockDistance);
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

	  function pickCoin(self, coins, activeThreats, maxDistance) {
	    const candidates = safeCoinCandidates(coins, activeThreats, maxDistance, self);
    if (!candidates.length) return null;
    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
      if (sticky) return sticky;
    }
    return candidates[0];
  }

  function pickCoinField(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.fieldMigrationMaxDistance, self)
      .filter(c => c.distance >= cfg.fieldMigrationMinDistance)
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    if (!candidates.length) return null;
    const buildFieldItem = coin => {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) return null;
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      return {
        ...coin,
        fieldMigration: true,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        fieldScore: score,
        opportunityScore: score,
        opportunityStaminaCost: staminaCost
      };
    };
    const current = bot.opportunityChoice;
    if (current?.key && current.reason === 'migrate-to-known-field' && now() < Number(current.until || 0)) {
      const heldCoin = candidates.find(c => String(c.drop_id) === String(current.id));
      const held = heldCoin ? buildFieldItem(heldCoin) : null;
      if (held && !fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, held)) return held;
    }
    let best = null;
    for (const coin of candidates.slice(0, 80)) {
      const item = buildFieldItem(coin);
      if (!item) continue;
      if (!best || item.fieldScore > best.fieldScore) best = item;
    }
    if (best && fieldMigrationBlockedByNearbyCoin(self, allCoins, activeThreats, best)) return null;
    return best;
  }

  function pickDistantCoin(self, allCoins, activeThreats) {
	    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.distantCoinMaxDistance, self)
      .filter(c => c.distance >= cfg.distantCoinMinDistance)
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    if (!candidates.length) return null;
    return candidates[0];
  }

  function recentCombatInjuryActive() {
    const injury = bot.pendingInjuryLeave;
    return injury && Date.now() - Number(injury.at || 0) <= Math.max(1000, cfg.combatStrafeLockMs * 3);
  }

  function combatTargetPriority(target, incomingOwnerId = null, unknownIncoming = false) {
    const incomingMatch = incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId);
    return (incomingMatch ? 1000000000 : 0)
      + (isFiringEntity(target) ? 500000000 : 0)
      + (unknownIncoming && isCurrentlyActive(target) ? 200000000 : 0)
      + (recentCombatInjuryActive() && isCurrentlyActive(target) ? 100000000 : 0)
      + (isJoinModeActive(target) ? 75000000 : 0)
      + (isCurrentlyActive(target) ? 50000000 : 0)
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }

  function isDefensiveCombatTarget(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkProfitTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId)) return true;
    if (isFiringEntity(target)) return true;
    if (isCurrentlyActive(target)) return true;
    if (unknownIncoming && isCurrentlyActive(target)) return true;
    return Boolean(recentCombatInjuryActive() && isCurrentlyActive(target));
  }

  function isProfitableCombatTarget(target) {
    return Boolean(target && !isWhitelistedTarget(target) && !isAfkProfitTarget(target) && !isInvulnerable(target) && isCurrentlyActive(target) && Number(target.drop || 0) > 0);
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

  function pickCombatTarget(self, combatTargets, bullets, options = {}) {
    if (!combatTargets.length) return null;
    const incoming = incomingBulletThreat(self, null, bullets);
    const incomingOwnerId = incoming?.ownerId;
    const unknownIncoming = Boolean(incoming && (incomingOwnerId === null || incomingOwnerId === undefined));
    if (incoming?.ownerId !== null && incoming?.ownerId !== undefined) {
      const shooter = combatTargets.find(target => String(target.user_id) === String(incoming.ownerId) && !isWhitelistedTarget(target) && !isInvulnerable(target));
      if (shooter) return { ...shooter, incomingBullet: incoming, combatIntent: 'defensive' };
    }
    const eligibleTargets = combatTargets.filter(target => !isWhitelistedTarget(target) && !isAfkProfitTarget(target) && !isInvulnerable(target));
    if (!eligibleTargets.length) return null;
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
    const sticky = bot.lastTarget?.kind === 'enemy' && now() - bot.lastTargetAt < cfg.targetStickMs
      ? [...defensiveTargets, ...profitableTargets].find(target => String(target.user_id) === String(bot.lastTarget.id))
      : null;
    if (sticky) return sticky;
    if (defensiveTargets[0]) return { ...defensiveTargets[0], combatIntent: 'defensive' };
    if (isFullHp(self) && profitableTargets[0]) return { ...profitableTargets[0], combatIntent: 'profit' };
    return null;
  }

  function combatEngageGraceRange() {
    return Math.max(Number(cfg.combatAttackRange || 0), Number(cfg.combatEngageGraceRange || 0));
  }

  function combatEngagedCandidate(self, raw) {
    if (!raw || !entityFreshEnoughForOffense(raw) || !isAlive(raw) || isWhitelistedTarget(raw) || isInvulnerable(raw)) return null;
    return {
      ...raw,
      distance: dist(self, raw),
      drop: dropValue(raw),
      speed: speed(raw),
      hp: combatHpValue(raw),
      knownHp: knownHpValue(raw)
    };
  }

  function pickEngagedCombatTarget(self, combatTargets, entities) {
    const engaged = bot.combatTarget;
    if (!engaged?.id) return null;
    const t = Date.now();
    const ageMs = Math.max(0, t - Number(engaged.at || 0));
    if (ageMs > Math.max(cfg.targetStickMs, cfg.combatEngageStickMs)) {
      clearCombatEngagement('expired');
      return null;
    }
    const target = (combatTargets || []).find(item => String(item.user_id ?? item.id ?? '') === String(engaged.id));
    if (target && !isWhitelistedTarget(target) && !isInvulnerable(target)) {
      if (String(engaged.intent || '') === 'profit' && isAfkProfitTarget(target)) {
        clearCombatEngagement('afk-profit-target');
        return null;
      }
      return {
        ...target,
        combatIntent: 'engaged',
        combatEngagement: {
          ageMs: Math.round(ageMs),
          outOfRangeMs: 0,
          lastReason: engaged.reason || ''
        }
      };
    }
    const lastInRangeAt = Number(engaged.lastInRangeAt || engaged.at || 0);
    const outOfRangeMs = Math.max(0, t - lastInRangeAt);
    const graceMs = Math.max(0, Number(cfg.combatEngageGraceMs || 0));
    if (!graceMs || outOfRangeMs > graceMs) {
      clearCombatEngagement('range-grace-expired');
      return null;
    }
    const raw = (entities || []).find(item => String(item.user_id ?? item.id ?? '') === String(engaged.id));
    const reengageTarget = combatEngagedCandidate(self, raw);
    const graceRange = combatEngageGraceRange();
    if (!reengageTarget || reengageTarget.distance > graceRange) return null;
    if (String(engaged.intent || '') === 'profit' && isAfkProfitTarget(reengageTarget)) {
      clearCombatEngagement('afk-profit-target');
      return null;
    }
    return {
      ...reengageTarget,
      combatIntent: 'reengage',
      combatEngagement: {
        ageMs: Math.round(ageMs),
        outOfRangeMs: Math.round(outOfRangeMs),
        graceRemainingMs: Math.max(0, Math.round(graceMs - outOfRangeMs)),
        graceRange: Math.round(graceRange),
        lastReason: engaged.reason || '',
        reengage: true
      }
    };
  }

  function defensiveTargetOverridesEngaged(engagedTarget, defensiveTarget) {
    if (!engagedTarget || !defensiveTarget?.incomingBullet) return false;
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

  function pickOpportunisticShotTarget(self, entities) {
    const candidates = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(entityFreshEnoughForOffense)
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => e.distance <= cfg.attackRange)
      .filter(e => attackWorthTaking(self, e) && !isInvulnerable(e))
      .filter(isAfkProfitTarget)
      .map(e => ({
        ...e,
        score: scoreEnemyOpportunity(e) ?? -Infinity,
        staminaCost: opportunityEnemyStaminaCost(e),
        estimatedShots: estimatedKillShots(e)
      }))
      .filter(e => opportunityStaminaAffordable(self, e.staminaCost))
      .sort((a, b) => {
        const stickyA = bot.attackHistory.some(item => String(item.id) === String(a.user_id) && Date.now() - Number(item.at || 0) <= cfg.targetStickMs);
        const stickyB = bot.attackHistory.some(item => String(item.id) === String(b.user_id) && Date.now() - Number(item.at || 0) <= cfg.targetStickMs);
        if (stickyA !== stickyB) return stickyA ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const target = candidates[0] || null;
    if (!target) return null;
    return {
      id: target.user_id,
      name: target.name || '',
      x: Number(target.x),
      y: Number(target.y),
      hp: combatHpValue(target),
      drop: target.drop,
      distance: Math.round(target.distance),
      score: Math.round(Number(target.score || 0)),
      staminaCost: Math.round(Number(target.staminaCost || 0)),
      estimatedShots: target.estimatedShots,
      mode: target.current_join_mode || '',
      reason: 'opportunistic-afk-drop-shot'
    };
  }

  function actionOpportunityScore(action) {
    const explicit = Number(action?.score ?? action?.opportunityChoice?.score);
    if (Number.isFinite(explicit)) return explicit;
    const target = action?.target || {};
    if (['coin', 'seek-coin'].includes(action?.kind) && Number(target.amount || 0) > 0) {
      return scoreCoinOpportunity({
        amount: Number(target.amount || 0),
        distance: Number(target.distance ?? action?.distance ?? 0),
        opportunityStaminaCost: Number.isFinite(Number(action?.staminaCost)) ? Number(action.staminaCost) : undefined
      });
    }
    return -Infinity;
  }

  function opportunisticShotBeatsAction(action, shot) {
    const shotScore = Number(shot?.score ?? scoreEnemyOpportunity(shot) ?? -Infinity);
    if (!Number.isFinite(shotScore)) return false;
    const actionScore = actionOpportunityScore(action);
    const minRatio = Math.max(0, Number(cfg.opportunisticShotMinScoreRatio ?? 1));
    return !Number.isFinite(actionScore) || actionScore <= 0 || shotScore >= actionScore * minRatio;
  }

  function attachOpportunisticShot(action, self, entities, options = {}) {
    if (!action || !['coin', 'seek-coin'].includes(action.kind) || action.combat) return action;
    if (options.recovery) return action;
    const shot = pickOpportunisticShotTarget(self, entities);
    if (!shot) return action;
    if (!opportunisticShotBeatsAction(action, shot)) return action;
    return { ...action, opportunisticShot: shot };
  }

  function buildOpportunisticShotWait(self, entities, options = {}) {
    if (options.recovery) return null;
    const shot = pickOpportunisticShotTarget(self, entities);
    if (!shot) return null;
    return {
      kind: 'wait',
      reason: 'opportunistic-afk-drop-shot',
      dx: 0,
      dy: 0,
      opportunisticShot: shot
    };
  }

  function incomingBulletThreat(self, target = null, bullets = getBullets()) {
    const selfId = Number(self?.user_id);
    let best = null;
    for (const raw of bullets || []) {
      const bullet = normalizeBullet(raw, raw?.native ? 'native' : 'snapshot');
      if (!bullet) continue;
      if (bullet.ownerId !== null && bullet.ownerId !== undefined && Number(bullet.ownerId) === selfId) continue;
      if (target && bullet.ownerId !== null && bullet.ownerId !== undefined && String(bullet.ownerId) !== String(target.user_id)) {
        continue;
      }
      const speedValue = hypot(Number(bullet.vx) || 0, Number(bullet.vy) || 0);
      if (speedValue <= 0.01) continue;
      const toSelfX = Number(self.x) - Number(bullet.x);
      const toSelfY = Number(self.y) - Number(bullet.y);
      const distance = hypot(toSelfX, toSelfY);
      if (distance > cfg.combatBulletDetectRadius) continue;
      const projection = (toSelfX * bullet.vx + toSelfY * bullet.vy) / speedValue;
      if (projection <= 0 || projection > cfg.combatBulletLookaheadDistance) continue;
      const signedLaneDistance = (toSelfX * bullet.vy - toSelfY * bullet.vx) / speedValue;
      const laneDistance = Math.abs(signedLaneDistance);
      if (laneDistance > cfg.combatBulletLaneRadius) continue;
      const timeToImpactMs = projection / speedValue * 50;
      const score = (cfg.combatBulletLaneRadius - laneDistance) * 1000
        + (cfg.combatBulletLookaheadDistance - projection)
        + Math.max(0, 1500 - timeToImpactMs);
      const item = {
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
        timeToImpactMs,
        score
      };
      if (!best || item.score > best.score) best = item;
    }
    return best;
  }

  function combatStrafeHoldMs() {
    const base = Math.max(300, Number(cfg.combatStrafeDirectionLockMs ?? cfg.combatStrafeLockMs) || 700);
    const jitter = Math.max(0, Number(cfg.combatStrafeRandomJitterMs) || 0);
    return base + (jitter ? Math.floor(Math.random() * jitter) : 0);
  }

  function combatStrafeKey(target, pressure) {
    const ownerId = pressure?.ownerId;
    if (ownerId !== null && ownerId !== undefined) return 'owner:' + ownerId;
    const targetId = target?.user_id ?? target?.id;
    if (targetId !== null && targetId !== undefined) return 'target:' + targetId;
    return 'combat';
  }

  function combatStrafeMatchesTarget(strafe, target) {
    if (!strafe) return false;
    const targetId = target?.user_id ?? target?.id;
    if (targetId === null || targetId === undefined) return true;
    const key = String(targetId);
    return strafe.targetId === key || strafe.key === 'target:' + key || strafe.key === 'owner:' + key;
  }

  function combatPreciseStrafeSign(pressure) {
    const signedLane = Number(pressure?.signedLaneDistance);
    const laneMin = Math.max(0, Number(cfg.combatStrafePreciseLaneMin ?? 1));
    return !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > laneMin
      ? -Math.sign(signedLane)
      : 0;
  }

  function selectCombatStrafeSign(existing, key, preciseSign, t = now()) {
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

	  function combatStrafeVector(self, target, pressure, sign, options = {}) {
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
	    return { dx: clamp(Math.round(dx), -1, 1), dy: clamp(Math.round(dy), -1, 1), closingBiased };
	  }

  function tangentMoveForBullet(self, target, pressure, options = {}) {
    const t = now();
    const existing = bot.combatStrafe;
    if (!pressure) {
      if (combatStrafeMatchesTarget(existing, target)
        && t < Number(existing?.carryUntil || 0)
        && (existing.dx || existing.dy)) {
        return {
          dx: clamp(Math.round(Number(existing.dx) || 0), -1, 1),
          dy: clamp(Math.round(Number(existing.dy) || 0), -1, 1),
          locked: true,
          carried: true,
          active: true,
          sign: Number(existing.sign || 0),
          key: existing.key,
          holdRemainingMs: Math.max(0, Math.round(Number(existing.until || 0) - t)),
          carryRemainingMs: Math.max(0, Math.round(Number(existing.carryUntil || 0) - t))
        };
      }
      return { dx: 0, dy: 0, locked: false, carried: false, active: false };
    }

    const key = combatStrafeKey(target, pressure);
    const preciseSign = combatPreciseStrafeSign(pressure);
    const strafeSign = selectCombatStrafeSign(existing, key, preciseSign, t);
    const sign = strafeSign.sign;
    const until = strafeSign.until;

	    let { dx, dy, closingBiased } = combatStrafeVector(self, target, pressure, sign, options);
    if (!(dx || dy) && existing && (existing.dx || existing.dy)) {
      dx = clamp(Math.round(Number(existing.dx) || 0), -1, 1);
      dy = clamp(Math.round(Number(existing.dy) || 0), -1, 1);
    }
    const carryMs = Math.max(0, Number(cfg.combatStrafeCarryMs) || 0);
    const targetId = target?.user_id ?? target?.id;
    bot.combatStrafe = {
      key,
      targetId: targetId !== null && targetId !== undefined ? String(targetId) : '',
      ownerId: pressure.ownerId !== null && pressure.ownerId !== undefined ? String(pressure.ownerId) : '',
      sign,
      dx,
      dy,
      until,
      carryUntil: t + carryMs
    };
    return {
	      dx,
	      dy,
	      locked: Boolean(strafeSign.locked),
	      lockOverridden: Boolean(strafeSign.lockOverridden),
      closingBiased: Boolean(closingBiased),
	      carried: false,
      active: true,
      sign,
      precise: Boolean(preciseSign),
      key,
      holdRemainingMs: Math.max(0, Math.round(until - t)),
      carryRemainingMs: carryMs
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
      dx: clamp(Math.round(dx), -1, 1),
      dy: clamp(Math.round(dy), -1, 1),
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

  function combatPressureCloseVector(self, target, targetDistance, noDamageMs, selfHp) {
    const thresholdMs = Math.max(0, Number(cfg.combatPressureCloseNoDamageMs || 0) || 0);
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const closeRange = Math.max(
      Number(cfg.combatSpacingMinRange || 0),
      Number(cfg.combatPressureCloseRange || cfg.combatSpacingPreferredRange || 0)
    );
    const minHp = Math.max(0, Number(cfg.combatPressureCloseMinHp || cfg.combatLowHpLeaveThreshold || 0));
    const elapsed = Math.max(0, Number(noDamageMs || 0));
    if (!thresholdMs || elapsed < thresholdMs || !(distance > closeRange) || Number(selfHp || 0) < minHp) {
      return { active: false, dx: 0, dy: 0, distance, closeRange, noDamageMs: elapsed };
    }
    const dir = directionTo(self, target);
    return {
      active: Boolean(dir.dx || dir.dy),
      dx: dir.dx,
      dy: dir.dy,
      distance,
      closeRange,
      noDamageMs: elapsed,
      reason: 'long-no-damage'
    };
  }

  function mergeCombatMove(primary, spacing, allowSpacingMerge = true) {
    if (!spacing?.active || !allowSpacingMerge) return primary || { dx: 0, dy: 0 };
    const current = primary || { dx: 0, dy: 0 };
    const mergeAxis = (value, spacingValue) => {
      const v = clamp(Math.round(Number(value) || 0), -1, 1);
      const s = clamp(Math.round(Number(spacingValue) || 0), -1, 1);
      if (v && s && Math.sign(v) !== Math.sign(s)) return s;
      return v || s;
    };
    return {
      ...current,
      dx: mergeAxis(current.dx, spacing.dx),
      dy: mergeAxis(current.dy, spacing.dy),
      spacingMerged: true
    };
  }

  function combatPressureThreat(self, target, bullets) {
    const bullet = target.incomingBullet || incomingBulletThreat(self, target, bullets) || incomingBulletThreat(self, null, bullets);
    if (bullet) return { ...bullet, reason: 'incoming-bullet' };
    const injury = bot.pendingInjuryLeave;
    const recentlyInjured = injury && Date.now() - Number(injury.at || 0) <= cfg.combatStrafeLockMs * 3;
    const pressure = recentlyInjured || isFiringEntity(target) || isCurrentlyActive(target);
    if (!pressure) return null;
    const vx = Number(self.x) - Number(target.x);
    const vy = Number(self.y) - Number(target.y);
    const distance = Math.hypot(vx, vy);
    return {
      id: 'pressure:' + (target.user_id ?? target.id ?? ''),
      ownerId: target.user_id ?? null,
      x: Number(target.x),
      y: Number(target.y),
      vx,
      vy,
      distance,
      projection: distance,
      laneDistance: 0,
      synthetic: true,
      reason: recentlyInjured ? 'recent-injury' : 'target-pressure'
    };
  }

  function combatAimJitterLimit(distance, motionScale = 1) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clamp(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const scale = clamp(Number.isFinite(Number(motionScale)) ? Number(motionScale) : 1, 0, 1);
    const minScale = clamp(Number(cfg.combatAimMinMotionJitterScale ?? 0.2), 0, 1);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clamp(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    const interpolated = (minJitter + (maxJitter - minJitter) * nearFactor) * Math.max(minScale, scale);
    const bulletSpeed = Math.max(1, Number(cfg.combatBulletSpeedPerTick || 500));
    const dodgeSpeed = Math.max(0, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const hitRadius = Math.max(0, Number(cfg.combatBulletHitRadiusCm || 90));
    const evasionScale = Math.max(0, Number(cfg.combatAimEvasionScale ?? 1));
    const travelTicks = d / bulletSpeed;
    const evasionWidth = (dodgeSpeed * scale * travelTicks + hitRadius) * evasionScale;
    const evasionAngle = d > 0 ? Math.atan(evasionWidth / d) : maxJitter;
    return clamp(Math.max(interpolated, evasionAngle), minJitter * minScale, maxJitter);
  }

  function combatAimMotionScale(target) {
    const maxSpeed = Math.max(1, Number(cfg.combatTargetDodgeSpeedPerTick || 50));
    const observedSpeed = Math.max(
      speed(target),
      Number(target?.motionObservedSpeed || 0),
      Number(target?.motionSampleSpeed || 0)
    );
    let scale = clamp(observedSpeed / maxSpeed, 0, 1);
    if (target?.recentlyMoved) {
      const decayMs = Math.max(1, Number(cfg.combatAimRecentMotionDecayMs || 900));
      const ageMs = Number(target.motionAgeMs);
      const recent = Number.isFinite(ageMs)
        ? clamp(1 - ageMs / decayMs, 0, 1)
        : 1;
      scale = Math.max(scale, recent * Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15)));
    }
    return scale;
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
    const afk = isAfkProfitTarget(target);
    const stopDistance = afk ? cfg.attackRange : cfg.attackEngageRange;
    const moveCost = opportunityMoveStaminaCost(target?.distance, stopDistance);
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
	      .map(coin => ({
	        ...coin,
	        distance: Number.isFinite(Number(coin?.distance)) ? Number(coin.distance) : dist(self, coin),
	        amount: Number(coin?.amount || 0)
	      }))
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
	      reloginDelayMs: staminaBudgetReloginDelayMs(),
	      snapshot: Boolean(coin.snapshot),
	      native: Boolean(coin.native)
	    };
	  }

	  function staminaBudgetCoinLeaveSummary(staminaBudgetExit) {
	    const detail = staminaBudgetExit || {};
	    return '1h体力预算不足，最近金币距离' + formatDistance(detail.distance)
	      + '，预算' + formatDurationMs(detail.budgetMs)
	      + '，需要' + formatDurationMs(detail.requiredMs)
	      + '，差' + formatDurationMs(detail.shortageMs)
	      + '，退出等待重连';
	  }

	  function staminaBudgetCoinLeaveDisplay(staminaBudgetExit) {
	    return staminaBudgetCoinLeaveSummary(staminaBudgetExit)
	      + '，等待' + formatDurationMs(staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs());
	  }

	  function staminaBudgetCoinLeaveAction(staminaBudgetExit) {
	    return {
	      kind: 'leave',
	      reason: 'stamina-budget-coin-leave',
	      dx: 0,
	      dy: 0,
	      offline: true,
	      ignoreReturnBlock: true,
	      displayReason: staminaBudgetCoinLeaveDisplay(staminaBudgetExit),
	      staminaBudgetExit,
	      reloginDelayMs: staminaBudgetExit?.reloginDelayMs || staminaBudgetReloginDelayMs()
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

  function combatTargetId(target) {
    const id = target?.user_id ?? target?.id;
    return id === null || id === undefined ? '' : String(id);
  }

  function combatAimDamageState(target) {
    const id = combatTargetId(target);
    const previous = bot.combatTarget;
    const same = previous && id && String(previous.id ?? '') === id;
    const t = Date.now();
    const currentHp = knownHpValue(target);
    const previousHp = same && Number.isFinite(Number(previous.hp)) ? Number(previous.hp) : null;
    const damaged = currentHp !== null && previousHp !== null && currentHp < previousHp - 0.01;
    const lastDamageAt = damaged
      ? t
      : (same ? Number(previous.lastDamageAt || previous.at || t) : t);
    const noDamageMs = Math.max(0, t - lastDamageAt);
    return {
      damaged,
      currentHp,
      previousHp,
      lastDamageAt,
      noDamageMs,
      widenMs: Math.max(0, noDamageMs - Math.max(0, Number(cfg.combatAimNoDamageMs) || 0))
    };
  }

  function combatLowHpNoDamageLeaveState(selfHp, targetHp, damageState) {
    const threshold = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveThreshold || 0));
    const waitMs = Math.max(0, Number(cfg.combatLowHpNoDamageLeaveMs || 0));
    const minGap = Number.isFinite(Number(cfg.combatLowHpNoDamageMinGap))
      ? Number(cfg.combatLowHpNoDamageMinGap)
      : 0;
    const hpGap = Number(targetHp) - Number(selfHp);
    const noDamageMs = Number(damageState?.noDamageMs || 0);
    if (!threshold || !waitMs || !(Number(selfHp) < threshold) || !(hpGap >= minGap) || !(noDamageMs >= waitMs)) return null;
    return { selfHp, targetHp, hpGap, noDamageMs, threshold, waitMs, minGap };
  }

  function combatShootingPlan(self, options = {}) {
    const stamina5s = staminaRemaining(self, '5s');
    const normalEveryMs = Math.max(1, Number(cfg.combatShootEveryMs || cfg.shootEveryMs || 120));
    const conserveEveryMs = Math.max(normalEveryMs, Number(cfg.combatShootConserveEveryMs || normalEveryMs));
    const recoveryEveryMs = Math.max(conserveEveryMs, Number(cfg.combatShootRecoveryEveryMs || conserveEveryMs));
    const hardReserveMs = Math.max(staminaExhaustedThreshold(), Number(cfg.combatShootHardReserveMs || staminaExhaustedThreshold()));
    const dodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootDodgeReserveMs || hardReserveMs));
    const highHpDodgeReserveMs = Math.max(hardReserveMs, Number(cfg.combatShootHighHpDodgeReserveMs || dodgeReserveMs));
    const reserveMs = Math.max(dodgeReserveMs, Number(cfg.combatShootReserveMs || dodgeReserveMs));
    const selfHp = hpValue(self);
    const targetHp = Number(options.targetHp);
    const highHpMin = Math.max(0, Number(cfg.combatShootHighHpMinHp || 0));
    const highHpFireWindow = highHpMin > 0
      && Number.isFinite(selfHp)
      && selfHp >= highHpMin
      && (!Number.isFinite(targetHp) || selfHp >= targetHp);
    const effectiveDodgeReserveMs = highHpFireWindow
      ? Math.min(dodgeReserveMs, highHpDodgeReserveMs)
      : dodgeReserveMs;
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
      hardReserveMs,
      needsMovement,
      highHpFireWindow,
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
    return base;
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

  function combatAimTarget(self, target) {
    const motionScale = combatAimMotionScale(target);
    const moving = speed(target) >= cfg.combatStationarySpeed
      || motionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const targetDistance = Number(target.distance);
    const distance = Number.isFinite(targetDistance) ? targetDistance : dist(self, target);
    const exact = {
      x: Number(target.x),
      y: Number(target.y),
      mode: 'exact',
      moving,
      distance,
      motionScale
    };
    if (!moving) return exact;
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const baseLimit = combatAimJitterLimit(distance, motionScale);
    const damage = combatAimDamageState(target);
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const noDamageLevel = combatAimNoDamageLevel(damage.widenMs);
    const jitterLimit = combatAimNoDamageJitterLimit(baseLimit, noDamageLevel);
    const movement = combatMovementAimMode(self, target, distance);
    const targetId = combatTargetId(target);
    const previousAim = bot.combatAim;
    let sign = Math.sign(movement.lateralSpeed || 0);
    if (!sign && previousAim && String(previousAim.targetId || '') === targetId) sign = Math.sign(Number(previousAim.sign || 0));
    if (!sign) sign = Math.random() < 0.5 ? -1 : 1;
    const noDamageBucket = noDamageLevel ? Math.floor(damage.widenMs / stepMs) + 1 : 0;
    const motionBucket = Math.round(motionScale * 10);
    let angle = 0;
    const locked = previousAim
      && String(previousAim.targetId || '') === targetId
      && String(previousAim.movementMode || '') === movement.mode
      && Number(previousAim.noDamageBucket || 0) === noDamageBucket
      && Number(previousAim.motionBucket ?? motionBucket) === motionBucket
      && now() < Number(previousAim.until || 0)
      && Number.isFinite(Number(previousAim.angle));
    if (locked) {
      angle = Number(previousAim.angle);
      sign = Math.sign(Number(previousAim.sign || sign)) || sign;
    } else {
      const aimScale = clamp(Math.max(0.2, motionScale), 0.2, 1);
      const spreadScale = clamp(Math.max(0.35, motionScale), 0.35, 1);
      const minLead = Math.min(jitterLimit, Math.max(0, Number(cfg.combatAimLeadMinRadians) || 0) * aimScale);
      const lead = Math.min(jitterLimit, Math.max(minLead, jitterLimit * movement.leadScale * aimScale));
      const randomSpread = jitterLimit * (noDamageLevel ? 0.35 : 0.22) * spreadScale;
      angle = sign * lead + (Math.random() * 2 - 1) * randomSpread;
      if (Math.abs(angle) < minLead && minLead > 0) angle = sign * minLead;
      angle = clamp(angle, -jitterLimit, jitterLimit);
      bot.combatAim = {
        targetId,
        angle,
        sign,
        movementMode: movement.mode,
        noDamageBucket,
        motionBucket,
        until: now() + Math.max(80, Number(cfg.combatAimLockMs) || 450)
      };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: Number(self.x) + dx * cos - dy * sin,
      y: Number(self.y) + dx * sin + dy * cos,
      mode: 'jitter',
      moving,
      angle,
      jitterLimit,
      distance,
      motionScale,
      movementMode: movement.mode,
      radialSpeed: movement.radialSpeed,
      lateralSpeed: movement.lateralSpeed,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: Boolean(noDamageLevel),
      lockedAim: Boolean(locked)
    };
  }

  function combatLeaveCoverAction(self, target, bullets, targetDistance = null) {
    const distance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : dist(self, target);
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const pressure = combatPressureThreat(self, target, bullets);
    const strafe = tangentMoveForBullet(self, target, pressure, { preferClosing: false });
    const dodging = Boolean(pressure || strafe.active);
    const spacing = combatSpacingVector(self, target, distance);
    const realBulletPressure = Boolean(pressure && !pressure.synthetic);
    const spacingOverride = realBulletPressure && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = dodging
      ? mergeCombatMove(strafe, spacing, !realBulletPressure || spacingOverride)
      : mergeCombatMove({ dx: 0, dy: 0 }, spacing, true);
    const requestedMove = { dx: combatMove.dx, dy: combatMove.dy };
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const aim = combatAimTarget(self, target);
    const shooting = combatShootingPlan(self, {
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      targetHp
    });
    return {
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed
          ? 'combat-stamina-conserve'
          : (realBulletPressure && !spacingOverride
            ? 'combat-leave-dodge'
            : (spacing.active && (combatMove.dx || combatMove.dy) ? 'combat-leave-spacing' : 'combat-leave-cover'))),
      dx: combatMove.dx,
      dy: combatMove.dy,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
        motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
        movementMode: aim.movementMode || '',
        noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
        widened: Boolean(aim.noDamageWidened),
        locked: Boolean(aim.lockedAim)
      },
      incomingBullet: pressure ? {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        synthetic: Boolean(pressure.synthetic),
        reason: pressure.reason || ''
      } : null,
      movementSuppressed,
      shooting,
      strafe: dodging ? {
        dx: combatMove.dx,
        dy: combatMove.dy,
        sign: strafe.sign,
        precise: Boolean(strafe.precise),
        locked: Boolean(strafe.locked),
        lockOverridden: Boolean(strafe.lockOverridden),
        carried: Boolean(strafe.carried)
      } : null,
      spacing: spacing.active ? {
        dx: spacing.dx,
        dy: spacing.dy,
        reason: spacing.reason,
        distance: Math.round(spacing.distance),
        minRange: Math.round(spacing.minRange),
        preferredRange: Math.round(spacing.preferredRange),
        merged: Boolean(combatMove.spacingMerged),
        overrideBullet: Boolean(spacingOverride)
      } : null
    };
  }

  function buildCombatAction(self, target, bullets) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const targetMotionScale = combatAimMotionScale(target);
    const targetMoving = speed(target) >= cfg.combatStationarySpeed
      || targetMotionScale >= Math.max(0, Number(cfg.combatAimMovingScaleThreshold || 0.15));
    const baseTarget = {
      id: target.user_id,
      name: target.name,
      x: target.x,
      y: target.y,
      hp: targetHp,
      knownHp: knownHpValue(target),
      drop: target.drop,
      distance: Math.round(targetDistance),
      moving: targetMoving,
      motionScale: Number(targetMotionScale.toFixed(2)),
      combatIntent: target.combatIntent || '',
      score: Number.isFinite(Number(target.combatOpportunityScore)) ? Number(target.combatOpportunityScore) : null,
      competingCoinScore: Number.isFinite(Number(target.competingCoinScore)) ? Number(target.competingCoinScore) : null,
      mode: target.current_join_mode || target.mode || '',
      life: target.life || '',
      active: isCurrentlyActive(target),
      firing: isFiringEntity(target),
      invulnerable: isInvulnerable(target)
	    };
	    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
	      return combatLeaveAction('combat-critical-hp-leave', baseTarget, { selfHp, targetHp }, combatLeaveCoverAction(self, target, bullets, targetDistance));
	    }
	    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
	      return combatLeaveAction('combat-low-hp-leave', baseTarget, { selfHp, targetHp }, combatLeaveCoverAction(self, target, bullets, targetDistance));
	    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
	    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
	      && Number.isFinite(hpGap)
	      && hpGap > cfg.combatHighHpDisadvantageGap) {
	      return combatLeaveAction('combat-hp-disadvantage-leave', baseTarget, { selfHp, targetHp, hpGap }, combatLeaveCoverAction(self, target, bullets, targetDistance));
	    }
    const pressure = combatPressureThreat(self, target, bullets);
    const realBulletPressure = Boolean(pressure && !pressure.synthetic);
    const spacing = combatSpacingVector(self, target, targetDistance);
    const closeRisk = combatLowHpCloseRiskState(selfHp, targetHp, spacing, realBulletPressure);
    if (closeRisk) {
      return combatLeaveAction('combat-low-hp-leave', baseTarget, { selfHp, targetHp, closeRisk }, combatLeaveCoverAction(self, target, bullets, targetDistance));
    }
    const damageState = combatAimDamageState(target);
    if (targetDistance > Number(cfg.combatAttackRange || 0)) {
      const dir = directionTo(self, target);
      const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(dir.dx || dir.dy)
        ? {
          reason: 'stamina-5s-exhausted',
          stamina5s: staminaRemaining(self, '5s'),
          thresholdMs: staminaExhaustedThreshold(),
          requestedDx: dir.dx,
          requestedDy: dir.dy
        }
        : null;
      return {
        kind: 'seek-enemy',
        reason: movementSuppressed ? 'combat-stamina-hold' : 'combat-reengage',
        combat: true,
        ignoreReturnBlock: true,
        shoot: false,
        forceShoot: false,
        dx: movementSuppressed ? 0 : dir.dx,
        dy: movementSuppressed ? 0 : dir.dy,
        target: baseTarget,
        combatState: {
          selfHp,
          targetHp,
          reengage: {
            distance: Math.round(targetDistance),
            attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
            outOfRangeMs: target.combatEngagement?.outOfRangeMs || 0,
            graceRemainingMs: target.combatEngagement?.graceRemainingMs || 0
          },
          movementSuppressed
        }
      };
    }
    const pressureClose = combatPressureCloseVector(self, target, targetDistance, damageState.noDamageMs, selfHp);
    const strafe = tangentMoveForBullet(self, target, pressure, { preferClosing: pressureClose.active });
    const dodging = Boolean(pressure || strafe.active);
    const spacingOverride = realBulletPressure && combatSpacingShouldOverrideBullet(spacing, selfHp, targetHp);
    let combatMove = dodging
      ? mergeCombatMove(strafe, spacing, !realBulletPressure || spacingOverride)
      : mergeCombatMove({ dx: 0, dy: 0 }, spacing, true);
    combatMove = mergeCombatMove(combatMove, pressureClose, !realBulletPressure);
    const requestedMove = { dx: combatMove.dx, dy: combatMove.dy };
    const movementSuppressed = combatMovementBlockedByStamina(self) && Boolean(combatMove.dx || combatMove.dy)
      ? {
        reason: 'stamina-5s-exhausted',
        stamina5s: staminaRemaining(self, '5s'),
        thresholdMs: staminaExhaustedThreshold(),
        requestedDx: combatMove.dx,
        requestedDy: combatMove.dy
      }
      : null;
    if (movementSuppressed) combatMove = { ...combatMove, dx: 0, dy: 0, movementSuppressed: true };
    const spacingActive = Boolean(spacing.active && (combatMove.dx || combatMove.dy));
    const aim = combatAimTarget(self, target);
    const pressureCloseActive = Boolean(pressureClose.active && (combatMove.dx || combatMove.dy));
    const shooting = combatShootingPlan(self, {
      needsMovement: Boolean(requestedMove.dx || requestedMove.dy),
      dodging,
      realBulletPressure,
      pressureClose: pressureClose.active,
      targetHp
    });
    const baseReason = realBulletPressure
      ? (spacingOverride ? 'combat-spacing-dodge' : 'combat-tangent-dodge')
      : (spacingActive
        ? (dodging ? 'combat-spacing-dodge' : 'combat-spacing')
        : (pressureCloseActive ? 'combat-pressure-close' : (dodging ? 'combat-tangent-dodge' : 'combat-attack')));
    return {
      kind: 'attack',
      reason: movementSuppressed
        ? 'combat-stamina-hold'
        : (shooting.suppressed ? 'combat-stamina-conserve' : (shooting.throttled ? 'combat-burst-fire' : baseReason)),
      combat: true,
      ignoreReturnBlock: true,
      shoot: shooting.shoot,
      forceShoot: shooting.forceShoot,
      shootEveryMs: shooting.shootEveryMs,
      dx: combatMove.dx,
      dy: combatMove.dy,
      target: baseTarget,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
        motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
        movementMode: aim.movementMode || '',
        noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
        widened: Boolean(aim.noDamageWidened),
        locked: Boolean(aim.lockedAim)
      },
      incomingBullet: pressure ? {
        id: pressure.id,
        ownerId: pressure.ownerId,
        distance: Math.round(Number(pressure.distance || 0)),
        laneDistance: Math.round(Number(pressure.laneDistance || 0)),
        signedLaneDistance: Number.isFinite(Number(pressure.signedLaneDistance)) ? Math.round(Number(pressure.signedLaneDistance)) : null,
        timeToImpactMs: Number.isFinite(Number(pressure.timeToImpactMs)) ? Math.round(Number(pressure.timeToImpactMs)) : null,
        synthetic: Boolean(pressure.synthetic),
        reason: pressure.reason || ''
      } : null,
      combatState: {
        selfHp,
        targetHp,
        aim: {
          movementMode: aim.movementMode || '',
          angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
          motionScale: Number.isFinite(Number(aim.motionScale)) ? Number(Number(aim.motionScale).toFixed(2)) : 0,
          noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
          widened: Boolean(aim.noDamageWidened),
          locked: Boolean(aim.lockedAim)
        },
        strafe: dodging ? {
          dx: combatMove.dx,
          dy: combatMove.dy,
          sign: strafe.sign,
	          precise: Boolean(strafe.precise),
	          locked: Boolean(strafe.locked),
	          lockOverridden: Boolean(strafe.lockOverridden),
          closingBiased: Boolean(strafe.closingBiased),
	          carried: Boolean(strafe.carried),
          holdRemainingMs: strafe.holdRemainingMs || 0,
          carryRemainingMs: strafe.carryRemainingMs || 0,
          spacingMerged: Boolean(combatMove.spacingMerged)
        } : null,
        spacing: spacingActive ? {
          dx: spacing.dx,
          dy: spacing.dy,
          reason: spacing.reason,
          distance: Math.round(spacing.distance),
          minRange: Math.round(spacing.minRange),
          preferredRange: Math.round(spacing.preferredRange),
          radialSpeed: Number.isFinite(Number(spacing.radialSpeed)) ? Math.round(Number(spacing.radialSpeed)) : null,
          merged: Boolean(combatMove.spacingMerged),
          overrideBullet: Boolean(spacingOverride)
        } : null,
        pressureClose: pressureClose.active ? {
          dx: pressureClose.dx,
          dy: pressureClose.dy,
          reason: pressureClose.reason,
          distance: Math.round(pressureClose.distance),
          closeRange: Math.round(pressureClose.closeRange),
          noDamageMs: Math.round(pressureClose.noDamageMs),
          preferClosing: Boolean(pressureClose.active),
          merged: Boolean(!realBulletPressure)
        } : null,
        movementSuppressed,
        shooting
      }
    };
  }

	  function snapshotCoinAgeMs() {
	    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
	  }

	  function isSnapshotCoinWaitAction(action) {
	    const reason = String(action?.reason || '');
	    return reason === 'wait-for-snapshot-coin'
	      || reason === 'wait-for-stamina-budget'
	      || reason === 'snapshot-coin-idle-timeout';
	  }

	  function pickSnapshotCoinDestination(self, allCoins, activeThreats, options = {}) {
	    const allowIdleFallback = Boolean(options.allowIdleFallback || options.idleFallback);
	    const ageMs = snapshotCoinAgeMs();
	    if (ageMs > cfg.snapshotCoinStaleMs) return null;
		    const candidates = safeCoinCandidates((allCoins || []).filter(isSnapshotOnlyCoin), activeThreats, cfg.snapshotCoinMaxDistance, self);
	    if (!candidates.length) return null;
	    const buildSnapshotItem = coin => {
	      const members = candidates.filter(other => dist(coin, other) <= Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius));
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
	      return {
	        ...coin,
	        snapshotMembers: members.length,
	        snapshotAmount: totalAmount,
	        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
	      };
	    };
	    const asOpportunity = item => ({ ...item, opportunityScore: item.snapshotScore });
	    const asIdleFallback = item => ({ ...asOpportunity(item), snapshotIdleFallback: true });
	    let stickyFallback = null;
	    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
	      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
	      if (sticky) {
	        const stickyItem = buildSnapshotItem(sticky);
	        if (opportunityStaminaAffordable(self, stickyItem.opportunityStaminaCost)
	          && snapshotCoinWorthLongTravel(sticky, stickyItem.snapshotMembers, stickyItem.snapshotAmount)) return asOpportunity(stickyItem);
	        if (allowIdleFallback) stickyFallback = stickyItem;
	      }
	    }
	    let best = null;
	    let idleBest = stickyFallback;
	    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
	    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
	    for (const coin of candidates.slice(0, 300)) {
	      const members = candidates.filter(other => dist(coin, other) <= radius);
	      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
	      const staminaCost = opportunityCoinStaminaCost(coin);
	      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
	      const item = {
	        ...coin,
        snapshotMembers: members.length,
        snapshotAmount: totalAmount,
        snapshotScore: score,
	        opportunityStaminaCost: staminaCost,
	        snapshotAgeMs: ageMs
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
	    if (best) return asOpportunity(best);
	    return idleBest ? asIdleFallback(idleBest) : null;
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

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? coin?.fieldScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScore(coin.amount, opportunityCoinStaminaCost(coin), cfg.coinOpportunityValue)
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkProfitTarget(target);
    const inRange = Number(target.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && now() - bot.lastTargetAt < cfg.targetStickMs;
    return opportunityValueScore(
      target.drop,
      opportunityEnemyStaminaCost(target),
      afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue
    ) + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function opportunityPriorityTier(item) {
    const distance = Number(item?.distance ?? Infinity);
    const nearDistance = Math.max(0, Number(cfg.opportunityNearbyPriorityDistance || 0));
    if (Number.isFinite(distance) && distance <= nearDistance) return 1;
    if (item?.type === 'enemy' && item?.kind === 'attack') return 1;
    return 0;
  }

  function bestCoinOpportunityScore(self, coinGroups, activeThreats) {
    let best = -Infinity;
    for (const { coins: groupCoins, maxDistance } of coinGroups) {
	      for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance, self)) {
        if (!opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin))) continue;
        const score = scoreCoinOpportunity(coin);
        if (score > best) best = score;
      }
    }
    return best;
  }

  function pickProfitableCombatTarget(self, combatTargets, bullets, coinGroups, activeThreats) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, combatTargets, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    if (!opportunityStaminaAffordable(self, opportunityEnemyStaminaCost(target))) return null;
    const coinScore = bestCoinOpportunityScore(self, coinGroups, activeThreats);
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

  function recentAttackTargetStillAttackable(attack, entities) {
    const id = String(attack?.id ?? '');
    const name = String(attack?.name || '');
    const target = (entities || []).find(entity => {
      if (!entityFreshEnoughForOffense(entity)) return false;
      if (id && String(entity.user_id ?? entity.id ?? '') === id) return true;
      return name && String(entity.name || '') === name;
    });
    if (!target || !isAlive(target)) return false;
    if (isWhitelistedTarget(target)) return false;
    if (isCurrentlyActive(target)) return false;
    if (isInvulnerable(target)) return false;
    return dropValue(target) > 0;
  }

  function pickPostAttackDropCoin(self, coins, activeThreats, entities, options = {}) {
    const t = Date.now();
    const recentAttacks = bot.attackHistory
      .slice()
      .reverse()
      .filter(item => t - Number(item.at || 0) <= cfg.postAttackDropCoinPriorityMs
        && Number.isFinite(Number(item.x))
        && Number.isFinite(Number(item.y)));
    const resolvedAttacks = recentAttacks.filter(attack => !recentAttackTargetStillAttackable(attack, entities));
    if (!resolvedAttacks.length) return null;
    const minAmount = options.includeSingle ? 0 : cfg.postAttackDropCoinMinAmount;
    const candidates = [];
	    for (const coin of safeCoinCandidates(coins, activeThreats, cfg.postAttackDropCoinMaxDistance, self)
      .filter(coin => Number(coin.amount || 0) > minAmount)
      .filter(coin => Number.isFinite(Number(coin.distance)))
      .filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)))) {
      const attack = resolvedAttacks
        .filter(item => dist(coin, item) <= cfg.postAttackDropCoinRadius)
        .sort((a, b) => Number(b.drop || 0) - Number(a.drop || 0) || Number(b.at || 0) - Number(a.at || 0))[0] || null;
      if (!attack) continue;
      candidates.push({
        ...coin,
        postAttackScore: scoreCoinOpportunity(coin),
        postAttackTarget: {
          id: attack.id,
          name: attack.name || '',
          drop: attack.drop,
          ageMs: Math.max(0, Math.round(t - Number(attack.at || t)))
        }
      });
    }
    return candidates
      .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0) || b.postAttackScore - a.postAttackScore || Number(a.distance || 0) - Number(b.distance || 0))[0] || null;
  }

  function enemyOpportunityCandidates(self, targets, activeThreats) {
    const byId = new Map();
    for (const raw of targets) {
      const id = raw?.user_id;
      if (!id && id !== 0) continue;
      const drop = Number(raw.drop ?? dropValue(raw) ?? 0);
      const distance = Number(raw.distance ?? Infinity);
      if (!drop || !Number.isFinite(distance) || distance > cfg.attackApproachRange) continue;
      if (isWhitelistedTarget(raw)) continue;
      if (isInvulnerable(raw)) continue;
      if (!attackWorthTaking(self, { ...raw, drop })) continue;
      if (activeThreats.some(t => dist(raw, t) <= cfg.attackDangerRadius)) continue;
      const item = { ...raw, drop, distance };
      const previous = byId.get(String(id));
      if (!previous || item.drop > previous.drop || item.distance < previous.distance || !item.minimapOnly) {
        byId.set(String(id), item);
      }
    }
    return Array.from(byId.values());
  }

  function buildCoinAction(self, coin, reason, kind = null) {
    const dir = coinDirectionTo(self, coin);
    const staminaCost = opportunityCoinStaminaCost(coin);
    return {
      kind: kind || (coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'),
      reason,
      target: {
        id: coin.drop_id,
        x: coin.x,
        y: coin.y,
        amount: coin.amount,
        distance: Math.round(dir.distance),
        fieldMembers: coin.snapshotMembers ?? coin.fieldMembers ?? null,
        fieldAmount: coin.snapshotAmount ?? coin.fieldAmount ?? null,
        snapshotAgeMs: Number.isFinite(Number(coin.snapshotAgeMs)) ? Math.round(Number(coin.snapshotAgeMs)) : null
      },
      dx: dir.dx,
      dy: dir.dy,
      ...coinMotionMeta(dir),
      score: Math.round(scoreCoinOpportunity(coin)),
      staminaCost: Math.round(staminaCost)
    };
  }

  function buildEnemyAction(self, target, reason = '') {
    if (isWhitelistedTarget(target)) return { kind: 'wait', reason: 'target-whitelisted', dx: 0, dy: 0 };
    const dir = directionTo(self, target);
    const afk = isAfkProfitTarget(target);
    const inRange = Number(dir.distance || Infinity) <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    const staminaCost = opportunityEnemyStaminaCost(target);
    return {
      kind: inRange ? 'attack' : 'seek-enemy',
      reason: reason || (afk
        ? (inRange ? 'best-opportunity-afk-drop-target' : 'approach-afk-drop-target')
        : (inRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target')),
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        drop: target.drop,
        distance: Math.round(dir.distance),
        hp: target.hp,
        afk,
        mode: target.current_join_mode || ''
      },
      dx: inRange ? 0 : dir.dx,
      dy: inRange ? 0 : dir.dy,
      shoot: inRange,
      score: Math.round(scoreEnemyOpportunity(target) || 0),
      staminaCost: Math.round(staminaCost),
      estimatedShots: estimatedKillShots(target)
    };
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
		    const t = now();
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
		    const actionKind = coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin';
		    const reason = current.reason || (actionKind === 'coin' ? 'best-opportunity-coin' : 'best-opportunity-visible-coin');
		    return {
		      type: 'coin',
		      id,
		      amount,
		      x,
		      y,
		      distance: coin.distance,
		      staminaCost,
		      score: scoreCoinOpportunity(coin),
		      priorityTier: opportunityPriorityTier({ type: 'coin', distance: coin.distance }),
		      actionKind,
		      reason,
		      maxDistance,
		      held: true,
		      missingHold: true,
		      holdUntil,
		      action: () => buildCoinAction(self, coin, reason, actionKind === 'seek-coin' ? 'seek-coin' : null)
		    };
		  }

			  function rememberOpportunityChoice(item, action, previous = bot.opportunityChoice) {
	    if (!item) return action;
	    const t = now();
	    const key = opportunityKey(item);
	    const same = previous && opportunityMatchesChoice(item, previous);
	    const missingHold = Boolean(item.missingHold);
	    bot.opportunityChoice = {
	      key,
	      type: item.type || '',
	      id: item.id ?? '',
	      at: same ? Number(previous.at || t) : t,
	      lastSeenAt: missingHold ? Number(previous?.lastSeenAt || previous?.at || t) : t,
	      until: missingHold ? Math.max(t, Number(item.holdUntil || previous?.until || t)) : t + Math.max(0, Number(cfg.opportunitySwitchHoldMs) || 0),
	      score: Math.round(Number(item.score || 0)),
	      staminaCost: Number.isFinite(Number(item.staminaCost)) ? Math.round(Number(item.staminaCost)) : null,
	      reason: action?.reason || item.reason || '',
	      x: Number.isFinite(Number(item.x)) ? Number(item.x) : null,
	      y: Number.isFinite(Number(item.y)) ? Number(item.y) : null,
	      amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : null,
	      distance: Number.isFinite(Number(item.distance)) ? Math.round(Number(item.distance)) : null,
	      actionKind: item.actionKind || action?.kind || '',
	      priorityTier: Number(item.priorityTier || 0),
	      maxDistance: Number.isFinite(Number(item.maxDistance)) ? Number(item.maxDistance) : null,
	      missingSince: missingHold ? Number(previous?.missingSince || t) : 0
	    };
	    return {
	      ...action,
	      opportunityChoice: {
	        type: bot.opportunityChoice.type,
	        id: bot.opportunityChoice.id,
	        score: bot.opportunityChoice.score,
	        staminaCost: bot.opportunityChoice.staminaCost,
	        held: Boolean(item.held),
	        missingHold,
	        competingScore: Number.isFinite(Number(item.competingScore)) ? Math.round(Number(item.competingScore)) : null,
	        holdRemainingMs: Math.max(0, Math.round(Number(bot.opportunityChoice.until || 0) - t))
	      }
	    };
	  }

	  function chooseStableOpportunity(opportunities) {
	    const sorted = opportunities
	      .slice()
	      .sort((a, b) => b.priorityTier - a.priorityTier || b.score - a.score || (a.type === b.type ? 0 : (a.type === 'enemy' ? -1 : 1)) || a.distance - b.distance);
	    const best = sorted[0] || null;
	    if (!best) return null;
    const current = bot.opportunityChoice;
	    if (current?.key && now() < Number(current.until || 0)) {
	      const held = sorted.find(item => opportunityMatchesChoice(item, current));
	      if (held && !opportunityMatchesChoice(best, current)) {
	        if (Number(best.priorityTier || 0) > Number(held.priorityTier || 0)) return best;
	        const margin = Math.max(0, Number(cfg.opportunitySwitchMargin) || 0);
        const relativeMargin = Math.max(0, Number(cfg.opportunitySwitchRelativeMargin) || 0);
        const heldScore = Number(held.score || 0);
        const requiredScore = Math.max(heldScore + margin, heldScore * (1 + relativeMargin));
        if (Number(best.score || 0) <= requiredScore) {
          return { ...held, held: true, competingScore: best.score };
	        }
	      }
	    }
		    return best;
		  }

  function pickBestOpportunity(self, activeThreats, coinGroups, enemyGroups) {
    const opportunities = [];
    const coinById = new Map();
    for (const { coins: groupCoins, maxDistance } of coinGroups) {
	      for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance, self)) {
        const id = String(coin.drop_id);
        const previous = coinById.get(id);
        const staminaCost = opportunityCoinStaminaCost(coin);
        if (!opportunityStaminaAffordable(self, staminaCost)) continue;
        const score = scoreCoinOpportunity(coin);
        if (!previous
          || score > Number(previous.opportunitySortScore || -Infinity)
          || (score === Number(previous.opportunitySortScore || -Infinity) && Number(coin.amount || 0) > Number(previous.amount || 0))
          || (score === Number(previous.opportunitySortScore || -Infinity) && Number(coin.distance || 0) < Number(previous.distance || Infinity))) {
	          coinById.set(id, { ...coin, opportunitySortScore: score, opportunityStaminaCost: staminaCost, opportunityMaxDistance: maxDistance });
        }
      }
    }
    for (const coin of coinById.values()) {
      const reason = snapshotCoinNavigationReason(coin);
	      opportunities.push({
	        type: 'coin',
	        id: coin.drop_id,
	        amount: coin.amount,
	        x: coin.x,
	        y: coin.y,
	        distance: coin.distance,
	        staminaCost: opportunityCoinStaminaCost(coin),
	        score: Number.isFinite(Number(coin.opportunitySortScore)) ? Number(coin.opportunitySortScore) : scoreCoinOpportunity(coin),
		        priorityTier: opportunityPriorityTier({ type: 'coin', distance: coin.distance }),
		        actionKind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
		        reason,
		        maxDistance: coin.opportunityMaxDistance,
		        action: () => buildCoinAction(
	          self,
	          coin,
          reason
        )
      });
    }

    const enemyTargets = enemyOpportunityCandidates(self, enemyGroups.flat(), activeThreats);
    for (const target of enemyTargets) {
      const score = scoreEnemyOpportunity(target);
      if (score === null) continue;
      const staminaCost = opportunityEnemyStaminaCost(target);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
	      opportunities.push({
	        type: 'enemy',
	        id: target.user_id,
	        distance: target.distance,
	        staminaCost,
	        score,
		        actionKind: target.distance <= (isAfkProfitTarget(target) ? cfg.attackRange : cfg.attackEngageRange) ? 'attack' : 'seek-enemy',
		        reason: '',
		        priorityTier: opportunityPriorityTier({
		          type: 'enemy',
		          kind: target.distance <= (isAfkProfitTarget(target) ? cfg.attackRange : cfg.attackEngageRange) ? 'attack' : 'seek-enemy',
          distance: target.distance
        }),
	        action: () => buildEnemyAction(self, target)
	      });
	    }

	    const missingHeld = buildMissingHeldOpportunity(self, activeThreats, opportunities);
	    if (missingHeld) opportunities.push(missingHeld);
			    const best = chooseStableOpportunity(opportunities);
		    if (!best) return null;
		    const action = best.action();
		    return rememberOpportunityChoice(best, action);
		  }

	  function patrolDirection(self, activeThreats, nearbyHumans, scanCoin = null) {
    if (scanCoin) {
      const dir = directionTo(self, scanCoin, cfg.patrolPrecisionTolerance);
      if ((dir.dx || dir.dy) && dir.distance <= cfg.patrolCoinMaxDistance) {
        return {
          ...dir,
          reason: 'scan-toward-distant-coin'
        };
      }
    }

    let vx = 0;
    let vy = 0;
    for (const human of nearbyHumans.slice(0, 8)) {
      const d = Math.max(1, dist(self, human));
      if (d > 50000) continue;
      const weight = (50000 - d + 1000) / d;
      vx += (Number(self.x) - Number(human.x)) * weight / d;
      vy += (Number(self.y) - Number(human.y)) * weight / d;
    }
    for (const threat of activeThreats.slice(0, 4)) {
      const d = Math.max(1, dist(self, threat));
      const activeLimit = Math.max(cfg.dangerRadius, Number(cfg.activeAvoidMaxDistance || cfg.activeCautionRadius));
      if (d > activeLimit) continue;
      const weight = (activeLimit - d + 1000) / d;
      vx += (Number(self.x) - Number(threat.x)) * weight / d;
      vy += (Number(self.y) - Number(threat.y)) * weight / d;
    }
	    let dx = Math.abs(vx) > 0.01 ? Math.sign(vx) : 0;
	    let dy = Math.abs(vy) > 0.01 ? Math.sign(vy) : 0;
	    if (dx || dy) {
	      bot.patrolHeading = null;
	      return { dx, dy, distance: 0, reason: 'maintain-safe-spacing' };
	    }
	    bot.patrolHeading = null;
		    return { dx: 0, dy: 0, distance: 0, reason: 'wait-for-snapshot-coin' };
		  }

	  function clearOpportunityChoiceFor(type, id = null) {
	    const choice = bot.opportunityChoice;
	    if (!choice || opportunityChoiceType(choice) !== String(type || '')) return;
	    if (id === null || id === undefined || id === '') {
	      bot.opportunityChoice = null;
	      return;
	    }
	    const choiceId = opportunityChoiceId(choice);
	    if (String(choiceId) === String(id)) bot.opportunityChoice = null;
	  }

	  function coinFailureIgnore(id, reason, t) {
    const previous = bot.coinFailures.get(id) || {};
    const lastAt = Number(previous.lastAt || 0);
    const count = lastAt && t - lastAt > cfg.coinFailureDecayMs ? 1 : Number(previous.count || 0) + 1;
    const base = reason === 'close' ? cfg.coinCloseFailureIgnoreMs
      : (reason === 'near' ? cfg.coinNearFailureIgnoreMs : cfg.coinNoProgressIgnoreMs);
    const ignoreMs = Math.min(cfg.coinFailureMaxIgnoreMs, Math.round(base * Math.max(1, count)));
    const ignoreUntil = t + ignoreMs;
    bot.coinFailures.set(id, { count, reason, lastAt: t, ignoreUntil });
    bot.ignoredCoins.set(id, ignoreUntil);
    return { count, ignoreMs, ignoreUntil };
  }

  function staleCoinEscapeDirection(action, self, t) {
    let awayDx = Math.sign(Number(self?.x) - Number(action.target.x)) || -(action.dx || 0);
    let awayDy = Math.sign(Number(self?.y) - Number(action.target.y)) || -(action.dy || 0);
    if (!(awayDx || awayDy)) {
      const phase = Math.floor(t / 1000) % 4;
      const pattern = [
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: -1 }
      ][phase];
      awayDx = pattern.dx;
      awayDy = pattern.dy;
    }
    bot.staleCoinEscape = {
      id: String(action.target.id),
      dx: awayDx,
      dy: awayDy,
      until: t + cfg.staleCoinEscapeMs
    };
    return { dx: awayDx, dy: awayDy };
  }

  function trackCoinProgress(action, self) {
    const t = now();
    for (const [id, attempt] of bot.coinAttempts.entries()) {
      if (t - Number(attempt.lastSeenAt || attempt.startedAt || t) > cfg.coinIgnoreMs * 3) {
        bot.coinAttempts.delete(id);
      }
    }

    const isCoinIntent = action
      && (action.kind === 'coin' || action.kind === 'seek-coin' || (action.kind === 'patrol' && action.target?.id && String(action.reason || '').includes('coin')))
      && action.target;
    if (!isCoinIntent) {
      bot.coinProgress = null;
      if (!bot.staleCoinEscape || t >= Number(bot.staleCoinEscape.until || 0)) bot.coinApproachLock = null;
      return action;
    }

    const id = String(action.target.id);
    const distance = Number(action.target.distance ?? Infinity);
    const amount = Math.max(0, Number(action.target.amount || 0) || 0);
    const targetX = Number(action.target.x);
    const targetY = Number(action.target.y);
    const attempt = bot.coinAttempts.get(id) || {
      id,
      startedAt: t,
      lastImprovedAt: t,
      bestDistance: distance,
      lastDistance: distance,
      amount,
      x: Number.isFinite(targetX) ? targetX : null,
      y: Number.isFinite(targetY) ? targetY : null,
      closeStartedAt: distance <= cfg.closeCoinStuckDistance ? t : 0,
      nearStartedAt: distance <= cfg.nearCoinStuckDistance ? t : 0
    };
    attempt.amount = amount || Number(attempt.amount || 0) || 0;
    if (Number.isFinite(targetX)) attempt.x = targetX;
    if (Number.isFinite(targetY)) attempt.y = targetY;
    attempt.lastSeenAt = t;
    const previousDistance = Number(attempt.lastDistance ?? distance);
    const attemptImproved = distance + cfg.coinProgressMinGain < Number(attempt.bestDistance);
    if (attemptImproved) {
      attempt.bestDistance = distance;
      attempt.lastImprovedAt = t;
    }
    const stillApproaching = distance + cfg.coinNearStuckResetGain < previousDistance;
    attempt.lastDistance = distance;
    if (distance <= cfg.closeCoinStuckDistance && !stillApproaching) {
      if (!attempt.closeStartedAt) attempt.closeStartedAt = t;
    } else {
      attempt.closeStartedAt = 0;
    }
    if (distance <= cfg.nearCoinStuckDistance && !stillApproaching) {
      if (!attempt.nearStartedAt) attempt.nearStartedAt = t;
    } else {
      attempt.nearStartedAt = 0;
    }
    bot.coinAttempts.set(id, attempt);

    const closeStuck = attempt.closeStartedAt && t - attempt.closeStartedAt >= cfg.closeCoinStuckMs;
    const nearStuck = attempt.nearStartedAt && t - attempt.nearStartedAt >= cfg.nearCoinStuckMs;
    if (closeStuck || nearStuck) {
      const failure = coinFailureIgnore(id, closeStuck ? 'close' : 'near', t);
      const ignoreUntil = failure.ignoreUntil;
      bot.coinAttempts.delete(id);
      bot.coinProgress = {
        id,
        startedAt: attempt.startedAt,
        lastImprovedAt: attempt.lastImprovedAt,
        bestDistance: Number(attempt.bestDistance),
        lastDistance: distance,
        ignoredAt: t,
        ignoreUntil
      };
	      if (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === id) {
	        bot.lastTarget = null;
	        bot.lastTargetAt = 0;
	      }
	      clearOpportunityChoiceFor('coin', id);
	      if (bot.coinApproachLock?.id === id) bot.coinApproachLock = null;
      const escape = staleCoinEscapeDirection(action, self, t);
      return {
        kind: 'patrol',
        reason: closeStuck ? 'ignore-close-stale-coin' : 'ignore-near-stale-coin',
        target: action.target,
        dx: escape.dx,
        dy: escape.dy,
        ignoredCoin: {
          id,
          distance,
          bestDistance: Number(attempt.bestDistance),
          closeAgeMs: attempt.closeStartedAt ? Math.round(t - attempt.closeStartedAt) : 0,
          nearAgeMs: attempt.nearStartedAt ? Math.round(t - attempt.nearStartedAt) : 0,
          ageMs: Math.round(t - Number(attempt.startedAt || t)),
          ignoreMs: failure.ignoreMs,
          failureCount: failure.count
        }
      };
    }

    const previous = bot.coinProgress;
    if (!previous || String(previous.id) !== id) {
      bot.coinProgress = {
        id,
        startedAt: t,
        lastImprovedAt: t,
        bestDistance: distance,
        lastDistance: distance,
        amount: attempt.amount,
        x: attempt.x,
        y: attempt.y
      };
      return action;
    }
    const improved = distance + cfg.coinProgressMinGain < Number(previous.bestDistance);
    if (improved) {
      bot.coinProgress = {
        ...previous,
        lastImprovedAt: t,
        bestDistance: distance,
        lastDistance: distance,
        amount: attempt.amount,
        x: attempt.x,
        y: attempt.y
      };
      return action;
    }
    bot.coinProgress = {
      ...previous,
      lastDistance: distance,
      amount: attempt.amount,
      x: attempt.x,
      y: attempt.y
    };
    if (t - Number(previous.lastImprovedAt || previous.startedAt || t) < cfg.coinNoProgressMs) {
      return action;
    }

    const failure = coinFailureIgnore(id, 'progress', t);
    const ignoreUntil = failure.ignoreUntil;
    bot.coinAttempts.delete(id);
    bot.coinProgress = {
      ...bot.coinProgress,
      ignoredAt: t,
      ignoreUntil
    };
	    if (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === id) {
	      bot.lastTarget = null;
	      bot.lastTargetAt = 0;
	    }
	    clearOpportunityChoiceFor('coin', id);
	    if (bot.coinApproachLock?.id === id) bot.coinApproachLock = null;
    const escape = staleCoinEscapeDirection(action, self, t);
    return {
      kind: 'patrol',
      reason: 'ignore-stale-coin-no-progress',
      target: action.target,
      dx: escape.dx,
      dy: escape.dy,
      ignoredCoin: {
        id,
        distance,
        bestDistance: Number(previous.bestDistance),
        ignoreMs: failure.ignoreMs,
        failureCount: failure.count
      }
    };
  }

  function setLastTarget(kind, id) {
    if (!id && id !== 0) return;
    if (!bot.lastTarget || bot.lastTarget.kind !== kind || String(bot.lastTarget.id) !== String(id)) {
      bot.lastTarget = { kind, id };
    }
    bot.lastTargetAt = now();
  }

  function clearCoinTracking(reason = '') {
    bot.coinProgress = null;
    bot.coinAttempts.clear();
    bot.coinApproachLock = null;
    bot.staleCoinEscape = null;
	    if (bot.lastTarget?.kind === 'coin') {
	      bot.lastTarget = null;
	      bot.lastTargetAt = 0;
	    }
	    clearOpportunityChoiceFor('coin');
	    bot.lastCoinClearReason = reason;
	  }

  function trackedCoinTargetForCollection(self) {
    const decision = bot.lastDecision || null;
    const decisionTarget = decision?.target || null;
    const decisionLooksLikeCoin = decisionTarget
      && (decision.kind === 'coin'
        || decision.kind === 'seek-coin'
        || (decision.kind === 'patrol' && String(decision.reason || '').includes('coin')));
    if (decisionLooksLikeCoin) {
      const target = { ...decisionTarget };
      target.id = target.id ?? bot.lastTarget?.id ?? bot.coinProgress?.id;
      if (!Number.isFinite(Number(target.distance)) && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y)) && self) {
        target.distance = dist(self, target);
      }
      return target;
    }
    if (bot.lastTarget?.kind === 'coin') {
      return {
        id: bot.lastTarget.id,
        distance: bot.coinProgress?.lastDistance,
        amount: bot.coinProgress?.amount,
        x: bot.coinProgress?.x,
        y: bot.coinProgress?.y
      };
    }
    if (bot.coinProgress?.id) {
      return {
        id: bot.coinProgress.id,
        distance: bot.coinProgress.lastDistance,
        amount: bot.coinProgress.amount,
        x: bot.coinProgress.x,
        y: bot.coinProgress.y
      };
    }
    return null;
  }

  function coinTargetKey(target) {
    const id = target?.id ?? target?.drop_id ?? target?.coin_id;
    if (id !== undefined && id !== null && id !== '') return 'id:' + String(id);
    const x = Number(target?.x);
    const y = Number(target?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return 'xy:' + Math.round(x) + ':' + Math.round(y) + ':' + Math.round(Number(target?.amount || 0));
    }
    return '';
  }

  function coinMatchesTrackedTarget(coin, target) {
    const targetId = target?.id ?? target?.drop_id ?? target?.coin_id;
    const coinId = coin?.drop_id ?? coin?.id ?? coin?.coin_id;
    if (targetId !== undefined && targetId !== null && targetId !== '' && coinId !== undefined && coinId !== null && coinId !== '') {
      if (String(targetId) === String(coinId)) return true;
    }
    const targetPoint = { x: Number(target?.x), y: Number(target?.y) };
    const coinPoint = { x: Number(coin?.x), y: Number(coin?.y) };
    if (!Number.isFinite(targetPoint.x) || !Number.isFinite(targetPoint.y) || !Number.isFinite(coinPoint.x) || !Number.isFinite(coinPoint.y)) return false;
    return dist(targetPoint, coinPoint) <= Number(cfg.coinCollectedPruneRadius || 0);
  }

  function trackedCoinStillVisible(target) {
    const nativeCoinList = getNativeCoinList();
    if (!Array.isArray(nativeCoinList)) return null;
    return nativeCoinList
      .map(coin => normalizeCoinDrop(coin, 'native'))
      .filter(Boolean)
      .some(coin => coinMatchesTrackedTarget(coin, target));
  }

  function recordSessionCoinPickup(target, amount, currentSummary, previousCoins, reason) {
    const value = Math.max(0, Math.round(Number(amount || 0)));
    if (!value) return false;
    updateSessionStats(currentSummary);
    const session = bot.session || (bot.session = {});
    const t = Date.now();
    const key = coinTargetKey(target);
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    session.coinPickupKeys = session.coinPickupKeys
      .filter(item => item && t - Number(item.at || 0) <= 60000)
      .slice(-80);
    if (key && session.coinPickupKeys.some(item => String(item.key || '') === key && t - Number(item.at || 0) <= 5000)) {
      return false;
    }
    if (key) pushBounded(session.coinPickupKeys, { key, at: t, amount: value, reason: reason || '' }, 80);
    session.coinPickupTotal = Math.max(0, Number(session.coinPickupTotal || 0) || 0) + value;
    const coinDiff = Math.max(0, Math.round(Number(currentSummary?.coins || 0) - Number(previousCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    return true;
  }

  function pruneCollectedSnapshotCoin(target) {
    const id = target?.id === undefined || target?.id === null ? '' : String(target.id);
    const x = Number(target?.x);
    const y = Number(target?.y);
    const hasPoint = Number.isFinite(x) && Number.isFinite(y);
    if (!id && !hasPoint) return 0;
	    const before = arrayCount(bot.globalState.coinDrops);
	    bot.globalState.coinDrops = (Array.isArray(bot.globalState.coinDrops) ? bot.globalState.coinDrops : []).filter(raw => {
      const coin = normalizeCoinDrop(raw, 'snapshot');
      if (!coin) return false;
      if (id && String(coin.drop_id) === id) return false;
      if (hasPoint && dist({ x, y }, coin) <= Number(cfg.coinCollectedPruneRadius || 0)) return false;
      return true;
    });
	    return before - arrayCount(bot.globalState.coinDrops);
  }

  function markCoinCollected(self, currentSummary, previousCoins) {
    const target = trackedCoinTargetForCollection(self);
    if (!target) return false;
    const id = target.id === undefined || target.id === null ? '' : String(target.id);
    const distance = Number(target.distance);
    if (Number.isFinite(distance) && distance > Number(cfg.coinCollectedConfirmDistance || 0)) return false;
    const currentCoins = Number(currentSummary?.coins || 0);
    const coinDelta = Math.max(0, Math.round(currentCoins - Number(previousCoins || 0)));
    const visible = trackedCoinStillVisible(target);
    const confirmed = coinDelta > 0 || visible === false;
    if (!confirmed) return false;
    const amount = Math.max(0, Math.round(Number(target.amount || 0))) || coinDelta;
    if (!amount) return false;
    const t = now();
    if (id) {
      bot.ignoredCoins.set(id, t + Number(cfg.coinCollectedIgnoreMs || 0));
      bot.coinAttempts.delete(id);
    }
    const pruned = pruneCollectedSnapshotCoin(target);
    const confirmReason = coinDelta > 0 ? 'coins-increased' : 'coin-disappeared';
    const sessionRecorded = recordSessionCoinPickup(target, amount, currentSummary, previousCoins, confirmReason);
    bot.lastCoinCollected = {
      id,
      amount,
      distance: Number.isFinite(distance) ? Math.round(distance) : null,
      previousCoins,
      currentCoins,
      pruned,
      confirmReason,
      sessionRecorded,
      at: Date.now()
    };
    clearCoinTracking(confirmReason);
    return true;
  }

  function chooseAction(self) {
    const { entities, activeThreats, inactiveTargets, coins, allCoins, snapshotCoins, globalTargets, minimapDropTargets, globalCoins, patrolCoins, scanCoins, nearbyHumans, combatTargets, bullets } = classify(self);
    bot.lastActionEntities = entities;
    const fullHp = isFullHp(self);
    const avoidanceThreats = fullHp ? activeThreats.filter(isInvulnerableActive) : activeThreats;
    bot.actionThreats = avoidanceThreats;
    const recovery = !fullHp && isRecovering(self);
    const coinThreats = avoidanceThreats;
    const closeThreats = avoidanceThreats.filter(e => e.distance <= e.threatRadius);
    const cautionThreats = avoidanceThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const engagedCombatTarget = pickEngagedCombatTarget(self, combatTargets, entities);
    const defensiveCombatTarget = pickCombatTarget(self, combatTargets, bullets, { mode: 'defensive' });
    bot.lastSafety = {
      fullHp,
      combatTargets: combatTargets.length,
      engagedCombat: engagedCombatTarget ? {
        id: engagedCombatTarget.user_id,
        name: engagedCombatTarget.name,
        distance: Math.round(engagedCombatTarget.distance),
        intent: engagedCombatTarget.combatIntent || '',
        ageMs: engagedCombatTarget.combatEngagement?.ageMs || 0,
        outOfRangeMs: engagedCombatTarget.combatEngagement?.outOfRangeMs || 0,
        graceRemainingMs: engagedCombatTarget.combatEngagement?.graceRemainingMs || 0
      } : null,
      nearestActive: activeThreats[0] ? {
        id: activeThreats[0].user_id,
        name: activeThreats[0].name,
        distance: Math.round(activeThreats[0].distance),
        speed: Math.round(activeThreats[0].speed),
        moving: Boolean(activeThreats[0].moving),
        threatRadius: Math.round(activeThreats[0].threatRadius),
        cautionRadius: Math.round(activeThreats[0].cautionRadius),
        returnBlockRadius: Math.round(returnBlockRadius(activeThreats[0])),
        returnBlockExitRadius: Math.round(returnBlockExitRadius(activeThreats[0])),
        returnBlockResumeRadius: Math.round(returnBlockResumeRadius(activeThreats[0]))
      } : null,
      nearestHuman: nearbyHumans[0] ? {
        id: nearbyHumans[0].user_id,
        name: nearbyHumans[0].name,
        distance: Math.round(nearbyHumans[0].distance),
        mode: nearbyHumans[0].current_join_mode
      } : null,
      recovery,
      avoidanceThreats: avoidanceThreats.length,
      nearestAvoidance: avoidanceThreats[0] ? {
        id: avoidanceThreats[0].user_id,
        name: avoidanceThreats[0].name,
        distance: Math.round(avoidanceThreats[0].distance),
        invulnerable: isInvulnerable(avoidanceThreats[0])
      } : null,
      conservingStamina: isConservingStamina(self)
    };
    const recoveryCombatTarget = defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)
      ? defensiveCombatTarget
      : (engagedCombatTarget || defensiveCombatTarget);
    if (recovery && recoveryCombatTarget) {
      const recoveryCombatAction = buildCombatAction(self, recoveryCombatTarget, bullets);
      if (engagedCombatTarget || recoveryCombatAction?.kind === 'leave') {
        bot.fleeLock = null;
        bot.returnBlockScan = null;
        return recoveryCombatAction;
      }
      clearCombatEngagement('recovery-hold');
    }
    if (!recovery && defensiveTargetOverridesEngaged(engagedCombatTarget, defensiveCombatTarget)) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!recovery && engagedCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, engagedCombatTarget, bullets);
    }
    if (fullHp && closeThreats.length) {
      const flee = lockedFleeDirection(self, closeThreats, 'active-threat-before-bullet-range');
      return {
        kind: 'flee',
        reason: 'active-threat-before-bullet-range',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: closeThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), invulnerable: isInvulnerable(e), r: Math.round(e.threatRadius) }))
      };
    }
    if (fullHp && cautionThreats.length) {
      const flee = lockedFleeDirection(self, cautionThreats, 'active-threat-caution-migration');
      return {
        kind: 'flee',
        reason: 'active-threat-caution-migration',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: cautionThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), invulnerable: isInvulnerable(e), r: Math.round(e.cautionRadius) }))
      };
    }
    if (!recovery && defensiveCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, defensiveCombatTarget, bullets);
    }
    if (!fullHp && closeThreats.length) {
      const flee = lockedFleeDirection(self, closeThreats, 'active-threat-before-bullet-range');
      return {
        kind: 'flee',
        reason: 'active-threat-before-bullet-range',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: closeThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), r: Math.round(e.threatRadius) }))
      };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = pickCoin(self, coins, coinThreats, nearCoinLimit);
    const footCoin = pickCoin(self, coins, coinThreats, cfg.footCoinPriorityDistance);
    const postAttackCoin = pickPostAttackDropCoin(self, allCoins, coinThreats, entities, { includeSingle: !recovery });
    if (postAttackCoin) {
      bot.fleeLock = null;
      if (bot.lastTarget?.kind === 'enemy') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
      }
      const action = buildCoinAction(self, postAttackCoin, 'post-attack-drop-coin');
	      action.postAttackTarget = postAttackCoin.postAttackTarget;
	      return action;
	    }
	    const staminaBudgetExit = summarizeNearestCoinStaminaBudgetExit(
	      self,
	      safeCoinCandidates(allCoins, coinThreats, cfg.snapshotCoinMaxDistance, self)
	    );
	    if (staminaBudgetExit) {
	      bot.fleeLock = null;
	      return staminaBudgetCoinLeaveAction(staminaBudgetExit);
	    }
	    if (recovery && nearCoin) {
	      bot.fleeLock = null;
	      const dir = coinDirectionTo(self, nearCoin);
      return {
        kind: 'coin',
        reason: 'recovery-foot-coin',
        target: { id: nearCoin.drop_id, x: nearCoin.x, y: nearCoin.y, amount: nearCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      };
    }

    const avoidHumans = nearbyHumans.filter(e => {
      if (e.distance > (recovery ? cfg.recoveryAvoidRadius : cfg.passivePanicRadius)) return false;
      return recovery ? isRecoveryUnsafeHuman(e) : true;
    });
	    if (!fullHp && avoidHumans.length) {
	      const reason = recovery ? 'recovery-avoid-humans' : 'passive-panic-distance';
	      const flee = lockedFleeDirection(self, avoidHumans, reason);
	      return {
        kind: 'flee',
        reason,
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
	        threats: avoidHumans.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), mode: e.current_join_mode, drop: e.drop, speed: Math.round(e.speed) }))
	      };
	    }

			    if (recovery) {
	      bot.fleeLock = null;
	      return {
        kind: 'recover',
        reason: 'wait-for-full-stamina-and-hp',
        dx: 0,
        dy: 0,
        recovery: {
          hp: Number(self.hp || 0),
          stamina5s: Number(self.stamina_5s_remaining_milli || 0),
          stamina5sLimit: Number(self.stamina_5s_limit_milli || 10000)
        }
      };
    }

	    if (!fullHp && cautionThreats.length) {
	      if (footCoin) {
	        bot.fleeLock = null;
	        const dir = coinDirectionTo(self, footCoin);
        return {
          kind: 'coin',
          reason: 'foot-coin-before-active-caution',
          target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
          dx: dir.dx,
          dy: dir.dy,
          ...coinMotionMeta(dir)
        };
      }
      const flee = lockedFleeDirection(self, cautionThreats, 'active-threat-caution-migration');
      return {
        kind: 'flee',
        reason: 'active-threat-caution-migration',
        dx: flee.dx,
        dy: flee.dy,
        locked: flee.locked,
        threats: cautionThreats.slice(0, 4).map(e => ({ id: e.user_id, name: e.name, d: Math.round(e.distance), drop: e.drop, speed: Math.round(e.speed), moving: Boolean(e.moving), r: Math.round(e.cautionRadius) }))
	      };
	    }

			    if (footCoin) {
	      bot.fleeLock = null;
	      const dir = coinDirectionTo(self, footCoin);
      return attachOpportunisticShot({
        kind: 'coin',
        reason: 'foot-coin-priority',
        target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      }, self, entities, { recovery });
    }

    const localRealtimeCoin = pickRealtimeLocalCoin(self, allCoins, coinThreats);
    const snapshotCompetitionCoin = localRealtimeCoin ? null : pickSnapshotCoinDestination(self, snapshotCoins, coinThreats);
    const fieldCompetitionCoin = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickCoinField(self, allCoins, coinThreats)
      : null;
    const opportunityCoinGroups = [
      { coins, maxDistance: cfg.coinMaxDistance },
      { coins: globalCoins, maxDistance: cfg.globalCoinMaxDistance },
      { coins: patrolCoins, maxDistance: cfg.patrolCoinMaxDistance },
      ...(fieldCompetitionCoin ? [{ coins: [fieldCompetitionCoin], maxDistance: cfg.fieldMigrationMaxDistance }] : []),
      ...(snapshotCompetitionCoin ? [{ coins: [snapshotCompetitionCoin], maxDistance: cfg.snapshotCoinMaxDistance }] : [])
    ];
    const profitableCombatTarget = pickProfitableCombatTarget(self, combatTargets, bullets, opportunityCoinGroups, coinThreats);
    if (profitableCombatTarget) {
      bot.fleeLock = null;
      bot.returnBlockScan = null;
      return buildCombatAction(self, profitableCombatTarget, bullets);
    }

    const opportunityEnemyGroups = fullHp
      ? [
        inactiveTargets.filter(isAfkProfitTarget),
        globalTargets.filter(target => !target.minimapOnly && isAfkProfitTarget(target))
      ]
      : [inactiveTargets, globalTargets, minimapDropTargets];
    const opportunity = pickBestOpportunity(
      self,
      coinThreats,
      opportunityCoinGroups,
      opportunityEnemyGroups
    );
    if (opportunity) {
      bot.fleeLock = null;
      return attachOpportunisticShot(opportunity, self, entities, { recovery });
    }

    const distantCoin = pickDistantCoin(self, allCoins, coinThreats);
    if (distantCoin) {
      bot.fleeLock = null;
      const dir = coinDirectionTo(self, distantCoin);
      return attachOpportunisticShot({
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        target: { id: distantCoin.drop_id, x: distantCoin.x, y: distantCoin.y, amount: distantCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      }, self, entities, { recovery });
    }

    if (localRealtimeCoin) {
      bot.fleeLock = null;
      const action = buildCoinAction(
        self,
        localRealtimeCoin,
        snapshotCoinNavigationReason(localRealtimeCoin),
        localRealtimeCoin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'
      );
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, action), self, entities, { recovery });
    }

    if (hasReturnBlockThreat(avoidanceThreats)) {
      bot.fleeLock = null;
      return buildReturnBlockScanAction(self, avoidanceThreats, nearbyHumans);
    }

    const snapshotCoin = snapshotCompetitionCoin;
    if (snapshotCoin) {
      bot.fleeLock = null;
      const action = buildCoinAction(
        self,
        snapshotCoin,
        snapshotCoinNavigationReason(snapshotCoin),
        'seek-coin'
      );
      action.target.fieldMembers = snapshotCoin.snapshotMembers;
      action.target.fieldAmount = snapshotCoin.snapshotAmount;
      action.target.snapshotAgeMs = Number.isFinite(snapshotCoin.snapshotAgeMs) ? Math.round(snapshotCoin.snapshotAgeMs) : null;
      action.score = Math.round(snapshotCoin.snapshotScore ?? action.score ?? 0);
      return attachOpportunisticShot(action, self, entities, { recovery });
    }

	    bot.fleeLock = null;
	    const shotWait = buildOpportunisticShotWait(self, entities, { recovery });
	    if (shotWait) return shotWait;
		    const snapshotWaitNow = Date.now();
		    if (!isSnapshotCoinWaitAction(bot.lastDecision) || !bot.snapshotCoinWaitSince) bot.snapshotCoinWaitSince = snapshotWaitNow;
		    const snapshotWaitAgeMs = Math.max(0, snapshotWaitNow - Number(bot.snapshotCoinWaitSince || snapshotWaitNow));
		    bot.lastSnapshotCoinWaitAgeMs = snapshotWaitAgeMs;
	    const snapshotWaitMaxMs = Math.max(0, Number(cfg.snapshotCoinIdleMaxMs || 0));
	    const snapshotWaitRemainingMs = Math.max(0, snapshotWaitMaxMs - snapshotWaitAgeMs);
		    if (!localRealtimeCoin && snapshotWaitAgeMs >= cfg.snapshotCoinIdleMaxMs) {
		      const idleSnapshotCoin = pickSnapshotCoinDestination(self, snapshotCoins, coinThreats, { allowIdleFallback: true });
		      if (idleSnapshotCoin) {
	        const action = buildCoinAction(
	          self,
	          idleSnapshotCoin,
	          snapshotCoinNavigationReason(idleSnapshotCoin),
	          'seek-coin'
	        );
	        action.target.fieldMembers = idleSnapshotCoin.snapshotMembers;
	        action.target.fieldAmount = idleSnapshotCoin.snapshotAmount;
	        action.target.snapshotAgeMs = Number.isFinite(idleSnapshotCoin.snapshotAgeMs) ? Math.round(idleSnapshotCoin.snapshotAgeMs) : null;
	        action.target.snapshotWaitAgeMs = Math.round(snapshotWaitAgeMs);
	        action.snapshotWaitAgeMs = Math.round(snapshotWaitAgeMs);
	        action.snapshotIdleFallback = true;
	        action.score = Math.round(idleSnapshotCoin.snapshotScore ?? action.score ?? 0);
	        return attachOpportunisticShot(action, self, entities, { recovery });
	      }
	    }
	    const blockedTargets = [
	      ...globalTargets.filter(target => !target.minimapOnly && isAfkProfitTarget(target)),
	      ...minimapDropTargets,
	      ...inactiveTargets
	    ];
	    const staminaBlocked = summarizeBlockedStaminaOpportunity(self, allCoins, blockedTargets);
	    const waitReason = staminaBlocked ? 'wait-for-stamina-budget' : 'wait-for-snapshot-coin';
	    const sourceSummary = bot.lastCoinSourceSummary || {};
	    const waitDisplay = staminaBlocked
	      ? '长期体力预算不足，预算' + formatDurationMs(staminaBlocked.budgetMs)
	        + '，最近目标需' + formatDurationMs(staminaBlocked.requiredMs)
	        + '，差' + formatDurationMs(staminaBlocked.shortageMs)
	        + (snapshotWaitRemainingMs > 0
	          ? '，' + formatDurationMs(snapshotWaitRemainingMs) + '后尝试远处快照金币'
	          : '，已达到' + formatDurationMs(snapshotWaitMaxMs) + '兜底等待')
	      : (snapshotWaitRemainingMs > 0
	        ? '等待快照金币，' + formatDurationMs(snapshotWaitRemainingMs) + '后尝试远处快照金币'
	        : '已达到' + formatDurationMs(snapshotWaitMaxMs) + '等待，暂无安全快照金币');
	    return {
	      kind: 'wait',
	      reason: waitReason,
	      dx: 0,
	      dy: 0,
	      displayReason: waitDisplay,
	      staminaBlocked,
	      coinSources: sourceSummary,
	      snapshot: {
		        coinDrops: arrayCount(bot.globalState.coinDrops),
	        ageMs: Number.isFinite(snapshotCoinAgeMs()) ? Math.round(snapshotCoinAgeMs()) : null,
	        waitAgeMs: Math.round(snapshotWaitAgeMs),
	        waitMaxMs: Math.round(snapshotWaitMaxMs),
	        waitRemainingMs: Math.round(snapshotWaitRemainingMs),
	        error: bot.globalState.error || ''
	      }
	    };
  }

  async function tick(source = 'timer') {
    if (!bot.running) return;
    if (bot.ticking) return bot.status();
    bot.ticking = true;
    try {
      bot.tickCount += 1;
      bot.lastTickAt = Date.now();
      const cloudflare = cloudflareErrorInfo();
      if (cloudflare) {
        bot.lastDecision = {
          kind: 'wait',
          reason: 'cloudflare-error-refresh',
          dx: 0,
          dy: 0,
          currentUserId: getCurrentUserId(),
          cloudflare,
          displayReason: cloudflare.displayReason,
          holdRemainingMs: cloudflare.remainingMs
        };
        updateBotPanel(bot.lastDecision);
        maybeReloadCloudflareError(cloudflare);
        if (cfg.once) bot.stop('once');
        return;
      }
      if (syncPausedFromPage()) {
        bot.lastDecision = {
          kind: 'idle',
          reason: 'paused',
          dx: 0,
          dy: 0,
          self: bot.lastSelf,
          paused: true,
          pauseReason: bot.pauseReason || 'manual'
        };
        if (cfg.once) bot.stop('once');
        return;
      }
				      const self = getSelf();
      const pendingExitDecision = await handlePendingExit(self);
      if (pendingExitDecision) {
        bot.lastDecision = pendingExitDecision;
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      const enemyHoldRemainingMs = enemyReloginHoldRemainingMs();
	      if (enemyHoldRemainingMs > 0) {
	        const enemyLeaveDetail = activeEnemyLeaveDetail();
	        bot.pursuit = null;
	        stopMotionSafely('enemy-leave-wait');
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
	        bot.lastDecision = {
          kind: 'wait',
          reason: 'enemy-leave-wait',
          dx: 0,
          dy: 0,
          self: self ? summarizeSelf(self) : null,
	          currentUserId: getCurrentUserId(),
	          control: summarizeControl(),
	          holdRemainingMs: enemyLeaveDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs(),
	          displayReason: enemyLeaveDetail?.displayReason || latestEnemyLeaveDisplayReason(),
	          leave: null,
	          pursuit: enemyLeaveDetail?.pursuit || bot.lastPursuitLeaveResult?.pursuit || null,
	          enemyLeave: {
	            displayReason: enemyLeaveDetail?.displayReason || '',
            summary: enemyLeaveDetail?.summary || '',
            enemyActor: enemyLeaveDetail?.enemyActor || null,
            reloginRepeatCount: enemyLeaveDetail?.reloginRepeatCount || enemyLeaveDetail?.enemyLeaveStreak?.count || 0,
            lastPursuitResult: bot.lastPursuitLeaveResult,
            lastCombatResult: bot.lastCombatLeaveResult,
            lastRetryResult: bot.lastEnemyLeaveRetryResult
          }
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      const offlineHoldControl = summarizeControl();
      let offlineHoldRemainingMs = offlineReloginHoldRemainingMs();
      if (offlineHoldRemainingMs > 0 && self && isAlive(self) && offlineHoldControl.wsOpen) {
        clearOfflineReloginHold('online self restored during offline hold');
        offlineHoldRemainingMs = 0;
      }
      if (offlineHoldRemainingMs > 0) {
        const offlineLeaveDetail = activeOfflineLeaveDetail();
        bot.pursuit = null;
	        stopMotionSafely('offline-leave-wait');
	        const currentSummary = self && isAlive(self) ? summarizeSelf(self) : (offlineLeaveDetail?.self || bot.lastSelf || null);
	        const offlineSafety = bot.lastOfflineSafety || offlineLeaveDetail?.offlineSafety || (self && isAlive(self) ? assessOfflineSafety(self) : null);
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
        bot.lastDecision = {
          kind: 'wait',
          reason: 'offline-leave-wait',
          dx: 0,
          dy: 0,
          self: currentSummary,
          currentUserId: getCurrentUserId(),
	          control: offlineHoldControl,
	          holdRemainingMs: offlineLeaveDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMs(),
	          displayReason: offlineLeaveDetail?.displayReason || offlineLeaveSummary('offline leave wait', offlineSafety),
	          offlineSafety,
	          leave: null,
	          offlineLeave: {
	            displayReason: offlineLeaveDetail?.displayReason || '',
	            summary: offlineLeaveDetail?.summary || '',
	            lastResult: bot.lastOfflineLeaveResult,
	            lastRetryResult: null
	          }
	        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
					      if (!self || !isAlive(self)) {
					        noteSelfUnavailableForPostLoginZoom();
					        bot.pursuit = null;
		        stopMotionSafely('no-self');
		        if (!bot.waitSince) bot.waitSince = Date.now();
	        const control = summarizeControl();
	        const noSelfAgeMs = Math.max(0, Date.now() - Number(bot.waitSince || Date.now()));
	        const noSelfExit = !self ? noSelfGameSessionExitState(control, noSelfAgeMs) : null;
	        if (!cfg.dryRun && noSelfExit?.shouldLeave) {
	          if (!bot.offlineSince) bot.offlineSince = Date.now();
	          const offlineAgeMs = Math.max(0, Date.now() - Number(bot.offlineSince || Date.now()));
	          const offlineSafety = {
	            unsafe: true,
	            noSelfGameSession: noSelfExit,
	            reconnectChurn: noSelfExit.reconnectChurn,
	            passiveDangerRadius: Math.max(0, Number(cfg.offlinePassiveDangerRadius || cfg.passivePanicRadius || 0)),
	            nearestHuman: null,
	            nearestActive: null
	          };
	          bot.lastOfflineSafety = offlineSafety;
	          stopMotionSafely(noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session');
	          const leaveResult = await leaveOffline(noSelfExit.reason, bot.lastSelf, offlineSafety);
	          const offlineDetail = activeOfflineLeaveDetail();
	          refreshGlobalState(false).catch(err => {
	            bot.globalState.error = err.message || String(err);
	          });
	          bot.lastDecision = {
	            kind: 'wait',
	            reason: leaveResult?.attempted && !leaveResult?.error
	              ? 'offline-leave'
	              : (noSelfExit.reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-no-self-game-session'),
	            dx: 0,
	            dy: 0,
	            currentUserId: getCurrentUserId(),
	            control,
	            visibleEntities: arrayCount(bot.globalState.entities),
	            self: null,
	            offlineAgeMs,
	            noSelfAgeMs,
	            noSelfGameSession: noSelfExit,
	            offlineSafety,
	            displayReason: leaveResult?.displayReason || offlineDetail?.displayReason || noSelfExit.displayReason,
	            leave: leaveResult
	          };
	          updateBotPanel(bot.lastDecision);
	          if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
	            requestReload('game session missing self too long');
	          }
	          if (cfg.once) bot.stop('once');
	          return;
	        }
	        const login = await maybeStartAutoLogin(self ? 'not-alive' : 'no-self');
	        const gameSessionPending = !self && controlHasNativeGameSession(control);
		        const waitReason = login?.attempted
		          ? 'auto-login'
		          : (login?.needed
		            ? (login?.reason === 'snapshot-gate'
		              ? 'login-snapshot-gate'
		              : (login?.error ? 'login-control-missing' : (login?.reason === 'suppressed' ? 'login-suppressed' : (login?.reason === 'exit-log-flush-pending' ? 'exit-log-flush-pending' : 'login-cooldown'))))
		            : (gameSessionPending ? 'game-session-connecting' : (self ? 'not-alive' : 'no-self')));
		        const loginDisplayReason = waitReason === 'game-session-connecting'
		          ? '已登录，等待游戏连接/自身实体'
		          : (waitReason === 'exit-log-flush-pending'
		            ? '等待退出日志发送完成，暂不刷新或重新登录'
		          : (waitReason === 'login-snapshot-gate'
		            ? loginSnapshotGateDisplayReason(login?.snapshotGate)
		          : (waitReason === 'login-suppressed'
		            ? '等待重连：' + (login?.suppressReason || 'login suppressed')
		              + (Number(login?.cooldownRemainingMs || 0) > 0 ? '，剩余' + formatDurationMs(login.cooldownRemainingMs) : '')
		            : '')));
		        refreshGlobalState(false).catch(err => {
		          bot.globalState.error = err.message || String(err);
		        });
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: waitReason,
		          displayReason: loginDisplayReason,
	          currentUserId: getCurrentUserId(),
			          control,
			          visibleEntities: arrayCount(bot.globalState.entities),
		          self,
		          noSelfAgeMs,
		          noSelfGameSession: noSelfExit,
	          login
		        };
	        updateBotPanel(bot.lastDecision);
	        const loginPending = Boolean(login?.attempted || (login?.needed && !login?.error));
	        if (!loginPending && Date.now() - bot.waitSince > cfg.reloadAfterNoSelfMs) {
	          requestReload('no self for too long');
        }
        if (cfg.once) bot.stop('once');
        return;
	      }
	      bot.waitSince = 0;
	      const hadPreviousSelf = Boolean(bot.lastSelf);
	      const previousHp = Number(bot.lastSelf?.hp ?? NaN);
	      const previousDrop = Number(bot.lastSelf?.drop ?? 0);
	      const previousCoins = Number(bot.lastSelf?.coins ?? 0);
	      const currentSummary = summarizeSelf(self);
      schedulePostLoginZoomOut(currentSummary);
		      const currentHp = Number(currentSummary.hp ?? NaN);
      const staminaState = currentSummary.stamina || summarizeStamina(self);
      if (staminaState.mustLeave && !bot.pendingExit) {
        bot.pursuit = null;
        bot.lastSelf = currentSummary;
        updateKillHistory(self);
        updateSessionStats(currentSummary);
        stopMotionSafely('stamina-exhausted');
        if (!bot.offlineSince) bot.offlineSince = Date.now();
        const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = {
          ...assessOfflineSafety(self),
          staminaExhausted: staminaState
        };
        bot.lastOfflineSafety = offlineSafety;
        const leaveResult = await leaveOffline('stamina exhausted', currentSummary, offlineSafety);
        const offlineDetail = activeOfflineLeaveDetail();
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveResult?.attempted && !leaveResult?.error ? 'stamina-exhausted-leave' : 'control-stamina-exhausted',
          dx: 0,
          dy: 0,
          control: summarizeControl(),
          self: currentSummary,
          offlineAgeMs,
          leaveDelayMs: 0,
          stamina: staminaState,
          offlineSafety,
          displayReason: leaveResult?.displayReason || offlineDetail?.displayReason || '',
          leave: leaveResult
        };
        updateBotPanel(bot.lastDecision);
        if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
          requestReload('stamina exhausted too long');
        }
        if (cfg.once) bot.stop('once');
        return;
      }
      const coinMarked = hadPreviousSelf && markCoinCollected(self, currentSummary, previousCoins);
	      if (!coinMarked && Number(currentSummary.drop || 0) > previousDrop) {
	        clearCoinTracking('drop-increased');
	      }
	      bot.lastSelf = currentSummary;
	      updateKillHistory(self);
      if (hadPreviousSelf && Number.isFinite(previousHp) && Number.isFinite(currentHp) && currentHp > 0 && previousHp > currentHp) {
        bot.pendingInjuryLeave = {
          at: Date.now(),
          previousHp,
          currentHp,
          lostHp: Math.max(0, previousHp - currentHp),
          self: currentSummary,
          nearestActive: bot.lastSafety?.nearestActive || null,
          nearestHuman: bot.lastSafety?.nearestHuman || null
        };
      }
	      ensureControlWs();
      const serverPositionStall = assessServerPositionStall(self);
      const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
      const reconnectChurn = Boolean(bot.control.nativeReconnectChurn);
      const reconnectChurnDetail = reconnectChurn ? {
        count: Number(bot.control.nativeReconnectEventCount || 0),
        windowMs: Number(bot.control.nativeReconnectWindowMs || cfg.offlineReconnectChurnWindowMs || 0)
      } : null;
      const controlOffline = !bot.control.wsOpen || serverPositionStallOffline || reconnectChurn;
      const pendingExitAlive = Boolean(bot.pendingExit && self && isAlive(self));
		    if (!cfg.dryRun && controlOffline && !pendingExitAlive) {
		      bot.pursuit = null;
		      stopMotionSafely(serverPositionStallOffline ? 'server-position-stalled' : (reconnectChurn ? 'control-ws-reconnect-churn' : 'control-ws-offline'));
		      if (!bot.offlineSince) bot.offlineSince = Date.now();
		      const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = {
          ...assessOfflineSafety(self),
          reconnectChurn: reconnectChurnDetail
        };
        const safeLeaveMs = Math.min(3000, Math.max(0, Number(cfg.offlineSafeLeaveMs ?? cfg.offlineLeaveMs ?? 3000)));
        const unsafeLeaveMs = Math.max(0, Number(cfg.offlineUnsafeLeaveMs ?? 0));
        const leaveDelayMs = reconnectChurn ? 0 : (offlineSafety.unsafe ? unsafeLeaveMs : safeLeaveMs);
        const leaveResult = offlineAgeMs >= leaveDelayMs
			        ? await leaveOffline(serverPositionStallOffline ? 'server position stalled' : (reconnectChurn ? 'websocket reconnect churn' : 'websocket offline'), currentSummary, offlineSafety)
			        : null;
        const offlineDetail = activeOfflineLeaveDetail();
        const offlineWaitReason = leaveResult?.attempted && !leaveResult?.error
          ? 'offline-leave'
          : (serverPositionStallOffline
            ? 'control-ws-server-position-stalled'
            : (reconnectChurn
              ? 'control-ws-reconnect-churn'
              : (offlineSafety.unsafe ? 'control-ws-offline-unsafe' : 'control-ws-offline-safe-wait')));
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: offlineWaitReason,
	          control: summarizeControl(),
	          self: summarizeSelf(self),
	          offlineAgeMs,
          leaveDelayMs,
          offlineSafety,
          reconnectChurn: reconnectChurnDetail,
          serverPositionStall,
          displayReason: leaveResult?.displayReason || offlineDetail?.displayReason || (reconnectChurn ? 'WebSocket 反复重连，正在退出' : ''),
	          leave: leaveResult
	        };
	        updateBotPanel(bot.lastDecision);
	        if (!leaveResult?.attempted && offlineAgeMs > cfg.reloadAfterOfflineMs) {
	          requestReload('websocket offline too long');
	        }
        if (cfg.once) bot.stop('once');
        return;
      }
      bot.offlineSince = 0;
      if (!serverPositionStall?.active) resetServerPositionStall('online');
      refreshGlobalState(false).catch(err => {
        bot.globalState.error = err.message || String(err);
      });

      const pendingCombatLeave = pendingCombatLeaveAction();
      if (pendingCombatLeave) {
        bot.pursuit = null;
        sendActionVelocity(pendingCombatLeave);
        if (pendingCombatLeave.shoot && pendingCombatLeave.target) {
          shootAt(self, pendingCombatLeave.aimTarget || pendingCombatLeave.target, Boolean(pendingCombatLeave.forceShoot), { shootEveryMs: pendingCombatLeave.shootEveryMs });
        }
        const leaveResult = await leaveForCombat(pendingCombatLeave, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        const enemyDetail = activeEnemyLeaveDetail();
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveIssued ? 'combat-leave' : 'combat-leave-retry',
          dx: pendingCombatLeave.dx,
          dy: pendingCombatLeave.dy,
          self: currentSummary,
          target: pendingCombatLeave.target || null,
          combat: true,
          shoot: Boolean(pendingCombatLeave.shoot),
          forceShoot: Boolean(pendingCombatLeave.forceShoot),
          aimTarget: pendingCombatLeave.aimTarget || null,
          combatCover: pendingCombatLeave.combatCover || null,
          combatState: pendingCombatLeave.combatState || null,
          pendingCombatLeave: summarizePendingCombatLeave(),
          displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || pendingCombatLeave.displayReason || pendingCombatLeave.exitSummary || '',
          leave: leaveResult,
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }

      let action = chooseAction(self);
	      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      if (bot.pendingInjuryLeave && isCombatStateForInjuryLeave(action)) {
        action = {
          ...action,
          injury: {
            ...bot.pendingInjuryLeave,
            self: currentSummary,
            currentHp,
            suppressedByCombat: true,
            suppressedReason: 'combat-state'
          }
        };
        bot.pendingInjuryLeave = null;
      }
	      if (action.kind === 'leave' && action.combat) {
	        sendActionVelocity(action);
	        if (action.shoot && action.target) {
	          shootAt(self, action.aimTarget || action.target, Boolean(action.forceShoot), { shootEveryMs: action.shootEveryMs });
	        }
        const leaveResult = await leaveForCombat(action, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        const enemyDetail = activeEnemyLeaveDetail();
        bot.lastDecision = leaveIssued
          ? {
            ...action,
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || action.displayReason || action.exitSummary || '',
            leave: leaveResult,
            source,
            self: summarizeSelf(self)
          }
          : {
            kind: 'wait',
            reason: 'combat-leave-retry',
            dx: 0,
            dy: 0,
            self: currentSummary,
            source,
            target: action.target || null,
            combat: true,
            combatState: action.combatState || null,
            pendingCombatLeave: summarizePendingCombatLeave(),
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || action.displayReason || action.exitSummary || '',
            leave: leaveResult,
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
          };
        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	      }
	      if (action.kind === 'leave') {
	        const offlineSafety = {
	          ...assessOfflineSafety(self),
	          staminaBudgetExit: action.staminaBudgetExit || null
	        };
	        const skippedLeave = pendingExitSkipNewLeave('offline', action.reason || 'stamina budget coin leave', {
	          self: currentSummary,
	          offlineSafety,
	          summary: action.displayReason || offlineLeaveSummary(action.reason || 'stamina budget coin leave', offlineSafety)
	        });
	        if (skippedLeave) {
	          bot.lastDecision = {
	            ...action,
	            kind: 'wait',
	            reason: 'pending-exit-active',
	            dx: 0,
	            dy: 0,
	            source,
	            control: summarizeControl(),
	            self: currentSummary,
	            offlineSafety,
	            displayReason: skippedLeave.displayReason || action.displayReason || '',
	            leave: skippedLeave,
	            pendingExit: summarizePendingExit()
	          };
	          updateBotPanel(bot.lastDecision);
	          if (cfg.once) bot.stop('once');
	          return;
	        }
	        bot.pursuit = null;
	        stopMotionSafely(action.reason || 'leave');
	        bot.lastOfflineSafety = offlineSafety;
	        const leaveResult = await leaveOffline(action.reason || 'stamina budget coin leave', currentSummary, offlineSafety);
	        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
	        const offlineDetail = activeOfflineLeaveDetail();
	        bot.lastDecision = {
	          ...action,
	          kind: 'wait',
	          reason: leaveIssued ? action.reason : (action.reason ? action.reason + '-retry' : 'leave-retry'),
	          dx: 0,
	          dy: 0,
	          source,
	          control: summarizeControl(),
	          self: currentSummary,
	          offlineSafety,
	          displayReason: leaveResult?.displayReason || offlineDetail?.displayReason || action.displayReason || '',
	          leave: leaveResult,
	          holdRemainingMs: offlineDetail?.holdRemainingMs ?? offlineReloginHoldRemainingMs()
	        };
	        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	      }
	      if (bot.pendingInjuryLeave) {
	        const injury = {
	          ...bot.pendingInjuryLeave,
	          self: currentSummary,
	          currentHp,
	          nearestActive: bot.lastSafety?.nearestAvoidance || bot.lastSafety?.nearestActive || bot.pendingInjuryLeave.nearestActive || null,
	          nearestHuman: bot.lastSafety?.nearestHuman || bot.pendingInjuryLeave.nearestHuman || null
	        };
	        bot.pendingInjuryLeave = null;
	        const skippedLeave = pendingExitSkipNewLeave('injury', 'injury hp drop', {
	          injury,
	          summary: injuryLeaveSummary(injury)
	        });
	        if (!skippedLeave) {
	          Promise.resolve(leaveForInjury(injury)).catch(err => recordUnhandledTickError('injury-leave', err));
	        }
	        action = {
	          ...action,
	          injury: skippedLeave ? { ...injury, suppressedByPendingExit: true } : injury,
	          pendingExitIntent: skippedLeave
	            ? pendingExitIntentForSkippedLeave('injury', 'injury hp drop', skippedLeave)
	            : {
	              reason: 'injury-leave',
	              summary: injuryLeaveSummary(injury)
	            }
	        };
	      }
	      action = trackCoinProgress(action, self);
      const escape = bot.staleCoinEscape;
      const escapeActive = escape && now() < Number(escape.until || 0) && (escape.dx || escape.dy);
      if (escapeActive && action.kind !== 'flee') {
        action = {
          ...action,
          kind: 'patrol',
          reason: action.reason && String(action.reason).startsWith('ignore-') ? action.reason : 'leave-stale-coin',
          dx: escape.dx,
          dy: escape.dy,
          staleCoinEscape: {
            id: escape.id,
            remainingMs: Math.max(0, Math.round(Number(escape.until || 0) - now()))
          }
        };
      } else if (!escapeActive) {
        bot.staleCoinEscape = null;
      }
      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      const pursuit = updatePursuitTracking(self, bot.actionThreats || [], action);
      const pursuitSummary = summarizePursuit(pursuit);
	      if (pursuitSummary && pursuitSummary.durationMs >= Math.max(0, Number(pursuitSummary.thresholdMs || cfg.pursuitLeaveMs))) {
	        const skippedLeave = pendingExitSkipNewLeave('pursuit', 'sustained pursuit', {
	          self: currentSummary,
	          pursuit: pursuitSummary,
	          summary: pursuitLeaveSummary(pursuitSummary)
	        });
	        if (skippedLeave) {
	          action = {
	            ...action,
	            pursuit: pursuitSummary,
	            leave: skippedLeave,
	            pendingExitIntent: pendingExitIntentForSkippedLeave('pursuit', 'sustained pursuit', skippedLeave)
	          };
	        } else {
	        const leaveResult = await leaveForPursuit(pursuit, currentSummary);
	        const enemyDetail = activeEnemyLeaveDetail();
	        stopMotionSafely('pursuit-leave');
        if (leaveResult?.attempted && !leaveResult?.error) {
          bot.lastDecision = {
            kind: 'wait',
            reason: 'pursuit-leave',
            dx: 0,
            dy: 0,
            self: summarizeSelf(self),
            pursuit: pursuitSummary,
            displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || '',
            leave: leaveResult,
            reloginDelayMs: leaveResult.reloginDelayMs,
            holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
          };
          updateBotPanel(bot.lastDecision);
          if (cfg.once) bot.stop('once');
          return;
        }
        bot.lastDecision = {
          kind: 'wait',
          reason: 'pursuit-leave-retry',
          dx: 0,
          dy: 0,
          self: summarizeSelf(self),
          pursuit: pursuitSummary,
          displayReason: leaveResult?.displayReason || enemyDetail?.displayReason || '',
          leave: leaveResult,
          holdRemainingMs: enemyDetail?.holdRemainingMs ?? enemyReloginHoldRemainingMs()
        };
	        updateBotPanel(bot.lastDecision);
	        if (cfg.once) bot.stop('once');
	        return;
	        }
	      } else if (pursuitSummary) {
        action = {
          ...action,
          pursuit: pursuitSummary
        };
	      }
	      const canMove = true;
	      const canAttack = true;
	      if (!isSnapshotCoinWaitAction(action)) {
	        bot.snapshotCoinWaitSince = 0;
	        bot.lastSnapshotCoinWaitAgeMs = 0;
	      }
	      sendActionVelocity(action);
      if (action.opportunisticShot) {
        const shotSent = shootAt(self, action.opportunisticShot, false, { shootEveryMs: cfg.opportunisticShootEveryMs });
        if (shotSent) rememberAttack(self, action.opportunisticShot, 'opportunistic-shot');
      }
      if (action.kind === 'attack' && action.shoot && action.target) {
        shootAt(self, action.aimTarget || action.target, Boolean(action.forceShoot), { shootEveryMs: action.shootEveryMs });
        setLastTarget('enemy', action.target.id);
        if (action.combat) rememberCombatEngagement(self, action.target, action);
	        rememberAttack(self, action.target, action.kind);
      } else if ((action.kind === 'coin' || action.kind === 'seek-coin') && action.target) {
        setLastTarget('coin', action.target.id);
      } else if ((action.kind === 'seek-enemy' || action.kind === 'seek-drop') && action.target) {
        setLastTarget('enemy', action.target.id);
        if (action.combat) rememberCombatEngagement(self, action.target, action);
        else rememberAttack(self, action.target, action.kind);
      } else if (action.kind === 'flee') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
        clearCombatEngagement(action.reason || 'flee');
      }
      bot.lastDecision = {
        ...action,
        source,
        pendingExit: summarizePendingExit(),
        self: {
          ...summarizeSelf(self),
          canMove,
          canAttack
        }
      };
      updateBotPanel(bot.lastDecision);

	      if (Date.now() - bot.lastStatusAt >= cfg.statusEvery) {
	        bot.lastStatusAt = Date.now();
	        console.log('[grasp-rat-bot:status]', safeStringify(bot.lastDecision));
	      }

	      if (cfg.once) bot.stop('once');
		    } catch (err) {
		      recordUnhandledTickError(source, err);
		      try {
		        stopMotionSafely('bot-error');
		      } catch (stopErr) {
		        recordUnhandledTickError(source + ':stop-motion', stopErr);
		      }
		      bot.lastDecision = {
		        kind: 'wait',
		        reason: 'bot-error',
		        dx: 0,
		        dy: 0,
		        self: bot.lastSelf,
		        error: err?.message || String(err)
		      };
		      try {
		        updateBotPanel(bot.lastDecision);
		      } catch (panelErr) {
		        recordUnhandledTickError(source + ':error-panel', panelErr);
		      }
		      try {
		        console.error('[grasp-rat-bot:error]', err);
		      } catch (_) {}
		    } finally {
		      try {
		        recordCombatLogTick(source, bot.lastDecision);
		      } catch (logErr) {
		        try {
		          bot.combatLogging.lastError = 'record failed: ' + (logErr?.message || String(logErr));
		        } catch (_) {}
		      }
		      bot.ticking = false;
		    }
		  }

	  restorePersistedExitAuditLogs();

	  window[BOT_KEY] = bot;
	  if (previousBot && previousBot !== bot && previousBot.stop) {
	    try {
	      previousBot.stop('replaced by ' + cfg.version);
	    } catch (err) {
	      console.warn('[grasp-rat-bot] previous stop failed', err);
	    }
	  }

		  return refreshGlobalState(true)
		    .catch(err => {
		      bot.globalState.error = err?.message || String(err);
		      recordUnhandledTickError('startup-refresh', err);
		    })
		    .then(() => tick('startup'))
		    .then(() => {
		      bot.starting = false;
		      if (!cfg.once && bot.running) {
		        bot.timer = setInterval(() => {
		          runTickSafely('timer');
		        }, cfg.tickMs);
		      }
		      logStatus(cfg.dryRun ? 'started dry-run' : 'started live control');
		      return bot.status();
		    })
		    .catch(err => {
		      recordUnhandledTickError('startup-finalize', err);
		      bot.starting = false;
		      bot.ticking = false;
		      try {
		        stopMotionSafely('startup-error');
		      } catch (stopErr) {
		        recordUnhandledTickError('startup-finalize:stop-motion', stopErr);
		      }
		      if (!bot.lastDecision) {
		        bot.lastDecision = {
		          kind: 'wait',
		          reason: 'startup-error',
		          dx: 0,
		          dy: 0,
		          self: bot.lastSelf,
		          error: err?.message || String(err)
		        };
		      }
		      try {
		        updateBotPanel(bot.lastDecision);
		      } catch (panelErr) {
		        recordUnhandledTickError('startup-finalize:panel', panelErr);
		      }
		      try {
		        if (!cfg.once && bot.running && !bot.timer) {
		          bot.timer = setInterval(() => {
		            runTickSafely('timer');
		          }, cfg.tickMs);
		        }
		      } catch (timerErr) {
		        recordUnhandledTickError('startup-finalize:timer', timerErr);
		      }
		      try {
		        return bot.status();
		      } catch (statusErr) {
		        recordUnhandledTickError('startup-finalize:status', statusErr);
		        return { running: Boolean(bot.running), starting: Boolean(bot.starting), error: err?.message || String(err) };
		      }
		    });
	})()
`;
}

async function main() {
  const page = options.pageWs
    ? { title: '(direct page)', url: GAME_ORIGIN, webSocketDebuggerUrl: options.pageWs }
    : await findGamePage(options.cdp);
  console.log(`${options.pageWs ? 'Using direct game page' : 'Found game page'}: ${page.title} ${page.url}`);
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  if (options.bringToFront) await cdp.send('Page.bringToFront');

  if (options.statusOnly) {
    const status = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const bot = window.__graspRatBot;
          return bot?.status ? bot.status() : { running: false, message: 'bot not found' };
        })()
      `,
      returnByValue: true,
    });
    console.log(JSON.stringify(status.result.value, null, 2));
    cdp.close();
    return;
  }

	  if (options.diagnoseOnly) {
	    const diagnosis = await cdp.send('Runtime.evaluate', {
	      expression: `
	        (async () => {
	          const bot = window.__graspRatBot || null;
	          const botStatus = bot?.status ? bot.status() : null;
	          const id = Number(localStorage.getItem('tmpGameUserId') || document.getElementById('userId')?.value || botStatus?.control?.currentUserId || 0);
	          const token = localStorage.getItem('tmpGameSessionToken') || '';
	          let snapshotSelf = null;
	          let visibleEntities = 0;
	          let snapshotError = '';
	          try {
	            const snapshot = await fetch('/snapshot', { cache: 'no-store' }).then(res => res.json());
	            visibleEntities = (snapshot.entities || []).length;
	            snapshotSelf = (snapshot.entities || []).find(entity => Number(entity.user_id) === id) || null;
	          } catch (err) {
	            snapshotError = err.message || String(err);
	          }
	          return {
	            title: document.title,
	            url: location.href,
	            currentUserId: id,
	            hasToken: Boolean(token),
	            control: botStatus?.control || null,
	            pageStatus: document.getElementById('status')?.textContent || '',
	            own: typeof getOwnEntity === 'function' ? getOwnEntity() : null,
	            snapshotSelf,
	            snapshotError,
	            visibleEntities,
	            botStatus,
	            recentLog: (document.body?.innerText || '').split('\\n').slice(0, 80).join('\\n')
	          };
	        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(JSON.stringify(diagnosis.result.value, null, 2));
    cdp.close();
    return;
  }

  const result = await cdp.send('Runtime.evaluate', {
    expression: browserBotSource({
      dryRun: options.dryRun,
      once: options.once,
      statusEvery: options.statusEvery,
      ...options.overrides,
    }),
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    console.error(JSON.stringify(result.exceptionDetails, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log('Injected bot:', JSON.stringify(result.result.value, null, 2));

  if (options.durationSec > 0) {
    await new Promise(resolve => setTimeout(resolve, options.durationSec * 1000));
    const stop = await cdp.send('Runtime.evaluate', {
      expression: `window.__graspRatBot?.stop('duration elapsed'); window.__graspRatBot?.status()`,
      returnByValue: true,
    });
    console.log('Stopped bot:', JSON.stringify(stop.result.value, null, 2));
  } else if (!options.once) {
    console.log('Bot is running inside the browser page. Stop with: node grasp-rat-stop.js');
  }
  cdp.close();
}

if (options.selfTest) {
  runSelfTest();
  process.exit(0);
}

if (options.printSource) {
  writeStdoutSync(browserBotSource({
    dryRun: options.dryRun,
    once: options.once,
    statusEvery: options.statusEvery,
    ...options.overrides,
  }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
