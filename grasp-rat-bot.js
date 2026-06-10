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
    nativeCoinAuthoritativeRadius: 45000,
    combatAttackRange: 14500,
    combatCriticalHpLeaveThreshold: 20,
    combatLowHpLeaveThreshold: 50,
    combatHighHpDisadvantageGap: 20,
    combatShootEveryMs: 80,
    combatStationarySpeed: 5,
    combatAimJitterRadians: 0.08,
    combatAimJitterMinRadians: 0.025,
    combatAimJitterMaxRadians: 0.16,
    combatAimJitterCloseDistance: 2500,
    combatAimJitterFarDistance: 14500,
    combatAimLeadMinRadians: 0.035,
    combatAimNoDamageMs: 1000,
    combatAimNoDamageStepMs: 800,
    combatAimNoDamageMaxRadians: 0.34,
    combatAimLockMs: 450,
    combatBulletDetectRadius: 30000,
    combatBulletLaneRadius: 3000,
    combatBulletLookaheadDistance: 42000,
    snapshotBulletStaleMs: 1500,
    snapshotSelfStaleMs: 6500,
    combatStrafeLockMs: 700,
    combatStrafeDirectionLockMs: 2200,
    combatStrafeRandomJitterMs: 1100,
    combatStrafeCarryMs: 1600,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 22000,
    combatLeaveRetryMs: 1000,
    enemyReloginMinDelayMs: 60000,
    enemyReloginMaxDelayMs: 600000,
    enemyReloginJitterMs: 15000,
    postAttackDropCoinMinAmount: 1,
    opportunisticShootEveryMs: 120,
    opportunisticShotMinScoreRatio: 1,
    attackMinDrop: 8,
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
    opportunityStickBonus: 35000,
    opportunitySwitchMargin: 120000,
    opportunitySwitchRelativeMargin: 0.2,
    opportunitySwitchHoldMs: 7000,
    coinMaxDistance: 18000,
    coinDangerRadius: 25000,
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
    snapshotCoinMaxDistance: 1200000,
    snapshotCoinClusterRadius: 22000,
    snapshotCoinClusterMinCoins: 2,
    snapshotCoinLocalFallbackMaxDistance: 22000,
    snapshotSingleCoinMaxDistance: 22000,
    snapshotSingleCoinDistancePerAmount: 30000,
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
    precisionPulseMaxMs: 260,
    coinPickupStopDistance: 30,
    coinPickupMicroDistance: 120,
    coinPickupFineDistance: 320,
    coinPickupSweepDistance: 900,
    coinPickupPulseMs: 240,
    coinPickupSweepPulseMs: 150,
    coinPickupFinePulseMs: 130,
    attackMinStamina: 0,
    passiveAvoidRadius: 11000,
    passivePanicRadius: 120,
    recoveryAvoidRadius: 22000,
    lowHpThreshold: 60,
    recoverHpThreshold: 95,
    staminaFullRatio: 0.98,
    conserveStaminaThreshold: 6500,
  };
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
  const isInvulnerableActive = e => e?.current_join_mode === 'Active' && isInvulnerable(e);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const staminaRemaining = (e, windowName) => {
    const value = Number(e?.['stamina_' + windowName + '_remaining_milli'] ?? NaN);
    return Number.isFinite(value) ? value : null;
  };
  const staminaExhaustedThreshold = () => Math.max(0, Number(cfg.staminaExhaustedThresholdMs ?? 1000));
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
  const isActive = e => isMovingThreat(e) || isFiringEntity(e) || (e.current_join_mode === 'Active' && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const isRecoveryUnsafeHuman = e => isActive(e);
  const isAfkTarget = e => !isActive(e) && !isMovingThreat(e);
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
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  const attackWorthTaking = (self, target) => {
    if (isWhitelistedTarget(target)) return false;
    const targetDrop = dropValue(target);
    if (isAfkTarget(target)) return targetDrop >= cfg.attackMinDrop;
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };
  function combatAimJitterLimit(distance) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clampValue(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clampValue(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    return minJitter + (maxJitter - minJitter) * nearFactor;
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
    const afk = isAfkTarget(target);
    const stopDistance = afk ? cfg.attackRange : cfg.attackEngageRange;
    const moveCost = opportunityMoveStaminaCost(target?.distance, stopDistance);
    const shotCost = estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500));
    return moveCost + shotCost;
  }
  function opportunityLongStaminaBudget(self) {
    const values = ['1h', '1d']
      .map(key => staminaRemaining(self, key))
      .filter(value => Number.isFinite(value));
    if (!values.length) return Infinity;
    const reserve = staminaExhaustedThreshold() + Math.max(0, Number(cfg.opportunityLongStaminaReserveMs || 0));
    return Math.max(0, Math.min(...values) - reserve);
  }
  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
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
  function pickField(self, coins, activeThreats) {
    const candidates = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.fieldMigrationMinDistance
        && c.distance <= cfg.fieldMigrationMaxDistance)
      .filter(c => !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    let best = null;
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) continue;
      const totalAmount = members.reduce((sum, item) => sum + item.amount, 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      if (!best || score > best.score) best = { ...coin, score, opportunityStaminaCost: staminaCost, members: members.length, totalAmount };
    }
    return best;
  }

  function pickDistantCoin(self, coins, activeThreats) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.distantCoinMinDistance
        && c.distance <= cfg.distantCoinMaxDistance)
      .filter(c => !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)))
      .sort(compareCoinOpportunity)[0] || null;
  }

  function safeCoins(self, coins, activeThreats, maxDistance) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= maxDistance)
      .filter(c => !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort(compareCoinOpportunity);
  }

  function pickSnapshotCoinDestination(self, coins, activeThreats) {
    const candidates = safeCoins(self, coins, activeThreats, cfg.snapshotCoinMaxDistance)
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    if (!candidates.length) return null;
    let best = null;
    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= radius);
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (!snapshotCoinWorthLongTravel(coin, members.length, totalAmount)) continue;
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
      if (!best
        || item.snapshotScore > best.snapshotScore
        || (item.snapshotScore === best.snapshotScore && members.length >= minCoins && best.snapshotMembers < minCoins)
        || (item.snapshotScore === best.snapshotScore && item.distance < best.distance)) best = item;
    }
    return best;
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

  function enemyTargets(self, entities, activeThreats) {
    return entities
      .filter(e => !isActive(e) && dropValue(e) > 0 && !isInvulnerable(e))
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e) }))
      .filter(e => e.distance <= cfg.attackApproachRange)
      .filter(e => attackWorthTaking(self, e))
      .filter(e => !activeThreats.some(t => dist(e, t) <= cfg.attackDangerRadius));
  }

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? NaN);
    if (Number.isFinite(override)) return override;
    return opportunityValueScore(coin.amount, opportunityCoinStaminaCost(coin), cfg.coinOpportunityValue);
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkTarget(target);
    const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
    if (!afk && !inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    return opportunityValueScore(
      target.drop,
      opportunityEnemyStaminaCost(target),
      afk ? cfg.coinOpportunityValue : cfg.dropOpportunityValue
    );
  }

  function bestCoinOpportunityScore(self, coins, activeThreats, snapshotCompetitionCoin = null) {
    let best = -Infinity;
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      if (!opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin))) continue;
      const score = scoreCoinOpportunity(coin);
      if (score > best) best = score;
    }
    const snapshotCoin = snapshotCompetitionCoin || pickSnapshotCoinDestination(self, coins, activeThreats);
    if (snapshotCoin) {
      if (opportunityStaminaAffordable(self, opportunityCoinStaminaCost(snapshotCoin))) {
        const score = scoreCoinOpportunity(snapshotCoin);
        if (score > best) best = score;
      }
    }
    return best;
  }

  function pickProfitableCombatTarget(self, entities, bullets, coins, activeThreats, snapshotCompetitionCoin = null) {
    if (!isFullHp(self)) return null;
    const target = pickCombatTarget(self, entities, bullets, { mode: 'profit' });
    if (!target) return null;
    const targetScore = scoreEnemyOpportunity(target);
    if (targetScore === null) return null;
    const coinScore = bestCoinOpportunityScore(self, coins, activeThreats, snapshotCompetitionCoin);
    if (targetScore < coinScore) return null;
    return {
      ...target,
      combatIntent: 'profit',
      combatOpportunityScore: Math.round(targetScore),
      competingCoinScore: Number.isFinite(coinScore) ? Math.round(coinScore) : null
    };
  }

  function combatTargetPriority(target, incomingOwnerId = null, unknownIncoming = false) {
    const incomingMatch = incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId);
    return (incomingMatch ? 1000000000 : 0)
      + (isFiringEntity(target) ? 500000000 : 0)
      + (unknownIncoming && isActive(target) ? 200000000 : 0)
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }
  function isDefensiveCombatTarget(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId)) return true;
    if (isFiringEntity(target)) return true;
    return Boolean(unknownIncoming && isActive(target));
  }
  function isProfitableCombatTarget(target) {
    return Boolean(target && !isWhitelistedTarget(target) && !isAfkTarget(target) && !isInvulnerable(target) && Number(target.drop || 0) > 0);
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
      if (shooter) return { ...shooter, combatIntent: 'defensive' };
    }
    const eligibleTargets = candidates.filter(e => !isAfkTarget(e));
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
      .filter(e => attackWorthTaking(self, e) && isAfkTarget(e))
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
      .filter(c => !activeThreats.some(threat => dist(c, threat) <= threat.coinDangerRadius))
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

  function chooseCombatAction(self, target, bullets = []) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
      return { kind: 'leave', reason: 'combat-critical-hp-leave', combat: true, target: { id: target.user_id, hp: targetHp, distance: Math.round(target.distance) }, combatState: { selfHp, targetHp } };
    }
    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
      return { kind: 'leave', reason: 'combat-low-hp-leave', combat: true, target: { id: target.user_id, hp: targetHp, distance: Math.round(target.distance) } };
    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap) {
      return { kind: 'leave', reason: 'combat-hp-disadvantage-leave', combat: true, target: { id: target.user_id, hp: targetHp, distance: Math.round(target.distance) }, combatState: { selfHp, targetHp, hpGap } };
    }
    const moving = speed(target) >= cfg.combatStationarySpeed;
    const incoming = isFiringEntity(target) || (bullets || []).some(b => Number(b.owner_id ?? b.ownerId ?? b.source_user_id ?? b.user_id) === Number(target.user_id));
    return {
      kind: 'attack',
      reason: incoming ? 'combat-tangent-dodge' : 'combat-attack',
      combat: true,
      ignoreReturnBlock: true,
      shoot: true,
      dx: incoming ? 1 : 0,
      dy: incoming ? 1 : 0,
      aimMode: moving ? 'jitter' : 'exact',
      aimJitterLimit: moving ? Number(combatAimJitterLimit(target.distance).toFixed(4)) : 0,
      target: { id: target.user_id, name: target.name, x: target.x, y: target.y, hp: combatHpValue(target), drop: target.drop, distance: Math.round(target.distance) }
    };
  }

  function pickBestOpportunity(self, entities, coins, activeThreats, snapshotCompetitionCoin = null) {
    const opportunities = [];
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      const staminaCost = opportunityCoinStaminaCost(coin);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      opportunities.push({
        type: 'coin',
        kind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin',
        id: coin.drop_id,
        amount: coin.amount,
        distance: coin.distance,
        staminaCost,
        score: scoreCoinOpportunity(coin)
      });
    }
    if (snapshotCompetitionCoin && !opportunities.some(item => item.type === 'coin' && String(item.id) === String(snapshotCompetitionCoin.drop_id))) {
      const staminaCost = opportunityCoinStaminaCost(snapshotCompetitionCoin);
      if (opportunityStaminaAffordable(self, staminaCost)) {
        opportunities.push({
          type: 'coin',
          kind: 'seek-coin',
          reason: snapshotCompetitionCoin.snapshotMembers >= cfg.snapshotCoinClusterMinCoins ? 'snapshot-coin-field' : 'snapshot-coin-target',
          id: snapshotCompetitionCoin.drop_id,
          amount: snapshotCompetitionCoin.amount,
          members: snapshotCompetitionCoin.snapshotMembers,
          distance: snapshotCompetitionCoin.distance,
          staminaCost,
          score: scoreCoinOpportunity(snapshotCompetitionCoin)
        });
      }
    }
    for (const target of enemyTargets(self, entities, activeThreats)) {
      const score = scoreEnemyOpportunity(target);
      if (score === null) continue;
      const staminaCost = opportunityEnemyStaminaCost(target);
      if (!opportunityStaminaAffordable(self, staminaCost)) continue;
      const afk = isAfkTarget(target);
      const inRange = target.distance <= (afk ? cfg.attackRange : cfg.attackEngageRange);
      opportunities.push({
        type: 'enemy',
        afk,
        kind: inRange ? 'attack' : 'seek-enemy',
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
    return opportunities
      .sort((a, b) => b.score - a.score || (a.type === b.type ? 0 : (a.type === 'enemy' ? -1 : 1)) || a.distance - b.distance)[0] || null;
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

  function choose({ local = [], global = [], coins = [], bullets = [], attacks = [], self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 } }) {
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
    if (fullHp && closeThreats.length) return { kind: 'flee' };
    if (fullHp && cautionThreats.length) return { kind: 'flee' };
    const defensiveCombatTarget = pickCombatTarget(self, entities, bullets, { mode: 'defensive' });
    if (defensiveCombatTarget) return chooseCombatAction(self, defensiveCombatTarget, bullets);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= nearCoinLimit
        && !coinThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const footCoin = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= cfg.footCoinPriorityDistance
        && !coinThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const postAttackCoin = pickPostAttackDropCoin(self, coins, coinThreats, attacks, entities, { includeSingle: !recovery });
    if (postAttackCoin) return { kind: 'coin', reason: 'post-attack-drop-coin', id: postAttackCoin.drop_id, amount: postAttackCoin.amount };
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
    const snapshotCompetitionCoin = pickSnapshotCoinDestination(self, coins, coinThreats);
    const profitableCombatTarget = pickProfitableCombatTarget(self, entities, bullets, coins, coinThreats, snapshotCompetitionCoin);
    if (profitableCombatTarget) return chooseCombatAction(self, profitableCombatTarget, bullets);
    const opportunityTargets = fullHp ? entities.filter(isAfkTarget) : entities;
    const opportunity = pickBestOpportunity(self, opportunityTargets, coins, coinThreats, snapshotCompetitionCoin);
    if (opportunity) return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, opportunity), self, entities, !recovery);
    if (stamina5s >= cfg.fieldMigrationStaminaThreshold) {
      const field = pickField(self, coins, coinThreats);
      if (field) {
        const dir = directionTo(self, field);
        return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
          kind: 'seek-coin',
          reason: 'migrate-to-known-field',
          id: field.drop_id,
          members: field.members,
          dx: dir.dx,
          dy: dir.dy,
          target: { distance: Math.round(dir.distance) }
        }), self, entities, !recovery);
      }
    }
    const distantCoin = pickDistantCoin(self, coins, coinThreats);
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
    if (hasReturnBlockThreat(avoidanceThreats)) return { kind: 'patrol', reason: 'return-block-lateral-scan' };
    const snapshotCoin = snapshotCompetitionCoin;
    if (snapshotCoin) {
      const dir = directionTo(self, snapshotCoin);
      return attachOpportunisticShot(blockThreatReturnAction(self, coinThreats, {
        kind: 'seek-coin',
        reason: snapshotCoin.snapshotMembers >= cfg.snapshotCoinClusterMinCoins ? 'snapshot-coin-field' : 'snapshot-coin-target',
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
    return { kind: 'wait', reason: 'wait-for-snapshot-coin' };
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
      name: 'foot coin beats non-defensive profitable active combat',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, death_reward_preview: 7 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'coin'
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
      name: 'profit combat hp disadvantage falls back to coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, max_hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active', vx: 30, hp: 91, death_reward_preview: 30 }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
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
      want: 'combat-attack'
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
        coins: [{ drop_id: 2, x: 40000, y: 0, amount: 5 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'single far low-value snapshot coin is skipped',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 2, x: 50000, y: 0, amount: 1 }]
      }).kind,
      want: 'wait'
    },
    {
      name: 'far snapshot coin cluster replaces open patrol',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 2, x: 50000, y: 0, amount: 1 },
          { drop_id: 3, x: 54000, y: 2000, amount: 1 },
          { drop_id: 4, x: 57000, y: -1000, amount: 1 }
        ]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'far snapshot coin cluster uses snapshot field reason',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 2, x: 50000, y: 0, amount: 1 },
          { drop_id: 3, x: 54000, y: 2000, amount: 1 },
          { drop_id: 4, x: 57000, y: -1000, amount: 1 }
        ]
      }).reason,
      want: 'snapshot-coin-field'
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
      name: 'critical hp combat leaves even when target hp is lower',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 19, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 1000, y: 0, current_join_mode: 'Passive', hp: 5, firing: true }]
      }).reason,
      want: 'combat-critical-hp-leave'
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
      name: 'high hp combat gap at threshold keeps fighting',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', hp: 90, firing: true }]
      }).kind,
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
      want: 'wait'
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
      name: 'stationary full-stamina active with drop can be attacked',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, death_reward_preview: 20 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'stationary full-stamina active in range does not start combat',
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
      name: 'invulnerable drop target is not attacked',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 20, invulnerable: true }]
      }).kind,
      want: 'wait'
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
          { drop_id: 2, x: -90000, y: -1000, amount: 1 },
          { drop_id: 3, x: -94000, y: 2000, amount: 1 },
          { drop_id: 4, x: -98000, y: -2000, amount: 1 }
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
          { drop_id: 2, x: 70000, y: -1000, amount: 1 },
          { drop_id: 3, x: 74000, y: 2000, amount: 1 },
          { drop_id: 4, x: 78000, y: -2000, amount: 1 }
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
      want: 'wait'
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
		  const PAUSED_KEY = 'graspRatBotPaused';
		  const PAUSE_REASON_KEY = 'graspRatBotPauseReason';
		  const previousBot = window[BOT_KEY] || null;
	  const preserved = {
	    attackHistory: Array.isArray(previousBot?.attackHistory) ? previousBot.attackHistory.slice(-80) : [],
	    killHistory: Array.isArray(previousBot?.killHistory) ? previousBot.killHistory.slice(-40) : [],
	    seenKillKeys: Array.isArray(previousBot?.seenKillKeysList) ? previousBot.seenKillKeysList.slice(-120) : [],
	    session: previousBot?.session && typeof previousBot.session === 'object' ? { ...previousBot.session } : null,
	    combatTarget: previousBot?.combatTarget && typeof previousBot.combatTarget === 'object' ? { ...previousBot.combatTarget } : null,
	    combatAim: previousBot?.combatAim && typeof previousBot.combatAim === 'object' ? { ...previousBot.combatAim } : null,
	    opportunityChoice: previousBot?.opportunityChoice && typeof previousBot.opportunityChoice === 'object' ? { ...previousBot.opportunityChoice } : null,
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
    nativeCoinAuthoritativeRadius: 45000,
    combatAttackRange: 14500,
    combatCriticalHpLeaveThreshold: 20,
    combatLowHpLeaveThreshold: 50,
    combatHighHpDisadvantageGap: 20,
    combatShootEveryMs: 80,
    combatStationarySpeed: 5,
    combatAimJitterRadians: 0.08,
    combatAimJitterMinRadians: 0.025,
    combatAimJitterMaxRadians: 0.16,
    combatAimJitterCloseDistance: 2500,
    combatAimJitterFarDistance: 14500,
    combatAimLeadMinRadians: 0.035,
    combatAimNoDamageMs: 1000,
    combatAimNoDamageStepMs: 800,
    combatAimNoDamageMaxRadians: 0.34,
    combatAimLockMs: 450,
    combatBulletDetectRadius: 30000,
    combatBulletLaneRadius: 3000,
    combatBulletLookaheadDistance: 42000,
    snapshotBulletStaleMs: 1500,
    snapshotSelfStaleMs: 6500,
    combatStrafeLockMs: 700,
    combatStrafeDirectionLockMs: 2200,
    combatStrafeRandomJitterMs: 1100,
    combatStrafeCarryMs: 1600,
    combatEngageStickMs: 30000,
    combatEngageGraceMs: 5000,
    combatEngageGraceRange: 22000,
    combatLeaveRetryMs: 1000,
    enemyReloginMinDelayMs: 60000,
    enemyReloginMaxDelayMs: 600000,
    enemyReloginJitterMs: 15000,
    attackMinDrop: 8,
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
    opportunityStickBonus: 35000,
    opportunitySwitchMargin: 120000,
    opportunitySwitchRelativeMargin: 0.2,
    opportunitySwitchHoldMs: 7000,
    coinMaxDistance: 18000,
    coinDangerRadius: 25000,
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
    snapshotCoinMaxDistance: 1200000,
    snapshotCoinClusterRadius: 22000,
    snapshotCoinClusterMinCoins: 2,
    snapshotCoinLocalFallbackMaxDistance: 22000,
    snapshotSingleCoinMaxDistance: 22000,
    snapshotSingleCoinDistancePerAmount: 30000,
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
    coinPickupMicroDistance: 120,
    coinPickupFineDistance: 320,
    coinPickupSweepDistance: 900,
    coinPickupPulseMs: 240,
    coinPickupSweepPulseMs: 150,
    coinPickupFinePulseMs: 130,
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
    autoLogin: true,
    loginCooldownMs: 5000,
    postLoginGraceMs: 45000,
    fleeLockMs: 1400,
    pursuitLeaveMs: 300000,
    pursuitLostGraceMs: 10000,
    pursuitLeaveRetryMs: 1000,
    pursuitTrackRadius: 42000,
    pursuitTowardCosMin: 0.25,
    pursuitClosingMinDistance: 250,
    offlineLeaveMs: 3000,
    offlineUnsafeLeaveMs: 0,
    offlineSafeLeaveMs: 3000,
    offlinePassiveDangerRadius: 2500,
    offlineLeaveRetryMs: 600,
    leaveCommandTimeoutMs: 600,
    offlineLeaveCooldownMs: 60000,
    serverPositionStallEnabled: true,
    serverPositionStallOfflineEnabled: false,
    serverPositionStallProbeMs: 1000,
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
    globalRefreshTimeoutMs: 1500,
    status: '',
    ...config,
    // The page owns the game WebSocket lifecycle; the bot must not reconnect or create a second socket.
    allowNativeReconnect: false,
    allowBotWebSocketFallback: false
  };

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
    lastLoginResult: null,
    lastOfflineLeaveAt: 0,
    lastOfflineLeaveResult: null,
    offlineReloginUntil: 0,
    lastOfflineSafety: null,
    serverPositionStall: null,
    serverPositionProbeAt: 0,
    lastPursuitLeaveAt: 0,
    lastPursuitLeaveResult: null,
    lastCombatLeaveAt: 0,
    lastCombatLeaveResult: null,
    pendingCombatLeave: null,
    lastInjuryLeaveAt: 0,
    lastInjuryLeaveResult: null,
    pendingInjuryLeave: null,
    lastEnemyLeaveRetryAt: 0,
    lastEnemyLeaveRetryResult: null,
    pursuitReloginUntil: 0,
    pursuit: null,
    combatStrafe: null,
    combatTarget: preserved.combatTarget,
    combatAim: preserved.combatAim,
    reloadRequestedAt: 0,
    lastTarget: null,
    lastTargetAt: 0,
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
	      logStatus('stopped: ' + reason);
	      if (window[BOT_KEY] === this) removeBotPanel();
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
	      if (changed || reasonChanged) postDebugEvent(next ? 'paused' : 'resumed', { reason: this.pauseReason || reason }, { force: true });
	      return this.status();
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
	        opportunityChoice: this.opportunityChoice,
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
		        globalState: {
		          refreshedAt: this.globalState.refreshedAt,
		          snapshotRefreshedAt: this.globalState.snapshotRefreshedAt,
		          snapshotAgeMs: this.globalState.snapshotRefreshedAt ? Date.now() - this.globalState.snapshotRefreshedAt : null,
		          tick: this.globalState.tick,
	          entities: arrayCount(this.globalState.entities),
	          bullets: arrayCount(this.globalState.bullets),
	          coinDrops: arrayCount(this.globalState.coinDrops),
	          minimapPoints: this.globalState.minimap?.points?.length || 0,
	          error: this.globalState.error
	        },
        control: summarizeControl(),
        serverPositionStall: summarizeServerPositionStall(),
        login: {
          lastAt: this.lastLoginAt || 0,
          lastAgeMs: this.lastLoginAt ? Date.now() - this.lastLoginAt : null,
          lastResult: this.lastLoginResult
        },
        offlineLeave: {
          lastAt: this.lastOfflineLeaveAt || 0,
          lastAgeMs: this.lastOfflineLeaveAt ? Date.now() - this.lastOfflineLeaveAt : null,
          holdUntil: this.offlineReloginUntil || 0,
          holdRemainingMs: Math.max(0, Math.round(Number(this.offlineReloginUntil || 0) - Date.now())),
          safety: this.lastOfflineSafety,
          lastResult: this.lastOfflineLeaveResult
        },
        pursuit: summarizePursuit(this.pursuit),
	        pursuitLeave: {
	          lastAt: this.lastPursuitLeaveAt || 0,
	          lastAgeMs: this.lastPursuitLeaveAt ? Date.now() - this.lastPursuitLeaveAt : null,
	          holdUntil: this.pursuitReloginUntil || 0,
	          holdRemainingMs: Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
	          lastResult: this.lastPursuitLeaveResult
	        },
	        enemyLeave: {
	          holdUntil: this.pursuitReloginUntil || 0,
	          holdRemainingMs: Math.max(0, Math.round(Number(this.pursuitReloginUntil || 0) - Date.now())),
	          reason: this.lastInjuryLeaveResult?.reason || this.lastPursuitLeaveResult?.reason || this.lastCombatLeaveResult?.reason || '',
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
  const isInvulnerableActive = e => e?.current_join_mode === 'Active' && isInvulnerable(e);
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
  const isCurrentlyActive = e => isMovingThreat(e) || isFiringEntity(e) || (e.current_join_mode === 'Active' && (!hasFullStamina(e) || isInvulnerableActive(e)));
  const isRecoveryUnsafeHuman = e => isCurrentlyActive(e);
  const isAfkTarget = e => !isCurrentlyActive(e) && !isMovingThreat(e);
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
  function nextHourlyStaminaResetAt(t = Date.now()) {
    const hourMs = 60 * 60 * 1000;
    return (Math.floor(t / hourMs) + 1) * hourMs;
  }
  function nextDailyStaminaResetAt(t = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const utc8OffsetMs = 8 * 60 * 60 * 1000;
    return (Math.floor((t + utc8OffsetMs) / dayMs) + 1) * dayMs - utc8OffsetMs;
  }
  function staminaResetHoldUntil(staminaState, t = Date.now()) {
    const exhausted = Array.isArray(staminaState?.longExhausted)
      ? staminaState.longExhausted
      : [];
    let until = 0;
    if (exhausted.includes('1h')) until = Math.max(until, nextHourlyStaminaResetAt(t));
    if (exhausted.includes('1d')) until = Math.max(until, nextDailyStaminaResetAt(t));
    if (!until) return null;
    const graceMs = Math.max(0, Number(cfg.staminaResetGraceMs || 0));
    return {
      until: until + graceMs,
      resetAt: until,
      graceMs,
      exhausted
    };
  }
  const attackWorthTaking = (self, target) => {
    if (isWhitelistedTarget(target)) return false;
    const targetDrop = dropValue(target);
    if (isAfkTarget(target)) return targetDrop >= cfg.attackMinDrop;
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };

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
	    return Number.isFinite(n) ? String(Math.round(n)) : '-';
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

	  function actionText(decision) {
	    const kind = decision?.kind || 'wait';
	    const target = decision?.target || null;
	    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
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
	    if (kind === 'wait') return '等待：' + (decision?.reason || '状态不足');
	    if (kind === 'leave') return '退出：' + (decision?.reason || '状态不足');
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
	      'wait-for-snapshot-coin': '等待快照金币',
	      'maintain-safe-spacing': '避开附近玩家',
	      'ignore-stale-coin-no-progress': '金币长时间无进展，临时脱离',
	      'leave-stale-coin': '离开疑似卡住金币',
	      'wait-for-full-stamina-and-hp': '等待恢复到安全状态',
	      'conserve-stamina-before-chasing': '兼容旧状态：保存体力',
	      'save-stamina-for-profitable-coin': '兼容旧状态：等待目标',
	      'combat-attack': '战斗：持续开火',
	      'combat-tangent-dodge': '战斗：切线规避并开火',
	      'combat-critical-hp-leave': '战斗血量低于 20，立即退出',
	      'combat-low-hp-leave': '战斗低血劣势，立即退出',
	      'combat-hp-disadvantage-leave': '战斗血量差劣势，立即退出',
	      'combat-leave': '战斗劣势退出后等待',
	      'combat-leave-retry': '战斗退出失败，等待补发退出',
	      'control-ws-offline': 'WebSocket 离线',
	      'control-ws-offline-unsafe': 'WebSocket 离线且周围危险，立即退出',
		      'control-ws-offline-safe-wait': 'WebSocket 离线，安全区短暂等待重连',
		      'control-ws-server-position-stalled': '服务端位置停止，按 WebSocket 离线处理',
		      'control-stamina-exhausted': '长周期体力耗尽，按 WebSocket 离线处理',
		      'stamina-exhausted-leave': '长周期体力耗尽，正在退出',
	      'offline-leave': 'WebSocket 离线，正在退出',
	      'offline-leave-wait': 'WebSocket 离线退出后等待，继续补发退出',
	      'pursuit-leave': '被同一玩家持续追击，退出等待',
	      'pursuit-leave-retry': '追击退出失败，等待补发退出',
	      'pursuit-leave-wait': '追击退出后等待重新登录',
	      'auto-login': '自动触发登录/加入',
	      'login-cooldown': '登录已触发，等待页面跳转',
	      'login-control-missing': '等待登录控件出现',
	      'no-self': '未读到自身实体',
	      'not-alive': '不在存活状态',
	      'bot-error': '脚本异常'
	    };
	    return map[reason] || reason || '-';
	  }

	  function updateBotPanel(decision = bot.lastDecision) {
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
	      '<div>原因：' + escapeHtml(reasonText(decision?.reason)) + '</div>',
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
			    postDebugEvent('status', { text, detail }, { force: true });
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

		  function postDebugEvent() {}

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
        try {
          postDebugEvent('unhandled-tick-error', entry, { force: true });
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
	    bot.reloadRequestedAt = Date.now();
	    logStatus('reload: ' + reason);
	    location.reload();
	  }
	
	  function getCurrentUserId() {
	    return Number(localStorage.getItem('tmpGameUserId') || document.getElementById('userId')?.value || bot.control.currentUserId || 0);
	  }
	
	  function getSessionToken() {
	    return localStorage.getItem('tmpGameSessionToken') || '';
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
      existingUntil = Number(localStorage.getItem('graspRatLoginSuppressUntil') || 0) || 0;
      existingReason = String(localStorage.getItem('graspRatLoginSuppressReason') || '');
    } catch (_) {}
    const reuseExisting = existingUntil > requestedUntil;
    const until = reuseExisting ? existingUntil : requestedUntil;
    const suppressReason = reuseExisting
      ? String(existingReason || reason || 'login flow')
      : String(reason || 'login flow');
    try {
      localStorage.setItem('graspRatLoginSuppressUntil', String(until));
      localStorage.setItem('graspRatLoginSuppressReason', suppressReason);
    } catch (_) {}
    return until;
  }

  function loginSuppressRemainingMs() {
    let until = 0;
    try {
      until = Number(localStorage.getItem('graspRatLoginSuppressUntil') || 0) || 0;
    } catch (_) {}
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && until) {
      try {
        localStorage.removeItem('graspRatLoginSuppressUntil');
        localStorage.removeItem('graspRatLoginSuppressReason');
      } catch (_) {}
    }
    return remaining;
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

  function reloginDelayForHp(selfLike, detail) {
    const info = hpInfoForRelogin(selfLike, detail);
    const minMs = Math.max(1000, Number(cfg.enemyReloginMinDelayMs) || 60000);
    const maxMs = Math.max(minMs, Number(cfg.enemyReloginMaxDelayMs) || minMs);
    const dangerFactor = Math.pow(1 - info.ratio, 1.35);
    const jitterMs = Math.max(0, Number(cfg.enemyReloginJitterMs) || 0);
    const delayMs = clamp(
      Math.round(minMs + (maxMs - minMs) * dangerFactor + randomBetween(0, jitterMs)),
      minMs,
      maxMs
    );
    return { delayMs, minMs, maxMs, hp: info };
  }

  function isExitLoginSuppressReason(reason) {
    return /enemy leave|offline.*leave|combat leave|pursuit leave/i.test(String(reason || ''));
  }

  function setExitReloginSuppress(storageReason, reason, detail, selfLike, options = {}) {
    let existingUntil = Number(options.existingUntil || 0);
    let existingReason = '';
    const minimumUntil = Math.max(0, Number(options.minimumUntil || 0) || 0);
    try {
      const storedReason = String(localStorage.getItem('graspRatLoginSuppressReason') || '');
      const storedUntil = Number(localStorage.getItem('graspRatLoginSuppressUntil') || 0) || 0;
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
      }
      return existingUntil;
    }
    const delay = reloginDelayForHp(selfLike, detail);
    const minimumDelayMs = minimumUntil > t ? Math.max(0, Math.round(minimumUntil - t)) : 0;
    const reloginDelayMs = Math.max(delay.delayMs, minimumDelayMs);
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
      detail.reloginHpDelayMs = delay.delayMs;
      detail.reloginDelayRangeMs = {
        min: delay.minMs,
        max: delay.maxMs
      };
      if (minimumDelayMs) {
        detail.reloginMinimumDelayMs = minimumDelayMs;
        detail.reloginMinimumUntil = minimumUntil;
        detail.reloginMinimumReason = options.minimumReason || '';
      }
      detail.reloginHp = delay.hp;
      detail.reloginUntil = reloginUntil;
      detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - Date.now()));
      detail.enemyLeaveReason = reason;
      detail.loginSuppressReason = storageReason;
    }
    return reloginUntil;
  }

  function setEnemyLeaveSuppress(reason, detail, selfLike = null) {
    return setExitReloginSuppress('enemy leave', reason, detail, selfLike);
  }

  function setOfflineLeaveSuppress(reason, detail, selfLike = null) {
    const staminaReset = staminaResetHoldUntil(detail?.offlineSafety?.staminaExhausted);
    if (staminaReset && detail) detail.staminaReset = staminaReset;
    return setExitReloginSuppress('offline leave', reason, detail, selfLike, {
      existingUntil: bot.offlineReloginUntil,
      minimumUntil: staminaReset?.until || 0,
      minimumReason: staminaReset ? 'stamina reset' : ''
    });
  }

  function enemyReloginHoldRemainingMs() {
    let until = Number(bot.pursuitReloginUntil || 0);
    try {
      const suppressUntil = Number(localStorage.getItem('graspRatLoginSuppressUntil') || 0) || 0;
      const suppressReason = String(localStorage.getItem('graspRatLoginSuppressReason') || '');
      if ((suppressReason === 'enemy leave' || suppressReason === 'pursuit leave' || suppressReason === 'combat leave') && suppressUntil > until) {
        until = suppressUntil;
        bot.pursuitReloginUntil = suppressUntil;
      }
    } catch (_) {}
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && bot.pursuitReloginUntil) bot.pursuitReloginUntil = 0;
    return Math.round(remaining);
  }

  function offlineReloginHoldRemainingMs() {
    let until = Number(bot.offlineReloginUntil || 0);
    try {
      const suppressUntil = Number(localStorage.getItem('graspRatLoginSuppressUntil') || 0) || 0;
      const suppressReason = String(localStorage.getItem('graspRatLoginSuppressReason') || '');
      if (/offline.*leave/i.test(suppressReason) && suppressUntil > until) {
        until = suppressUntil;
        bot.offlineReloginUntil = suppressUntil;
      }
    } catch (_) {}
    const remaining = Math.max(0, until - Date.now());
    if (!remaining && bot.offlineReloginUntil) bot.offlineReloginUntil = 0;
    return Math.round(remaining);
  }

  function summarizePursuit(pursuit = bot.pursuit) {
    if (!pursuit) return null;
    const t = now();
    const lastSeenAt = Number(pursuit.lastSeenAt || pursuit.startedAt || t);
    return {
      id: pursuit.id,
      name: pursuit.name || '',
      distance: Number.isFinite(Number(pursuit.distance)) ? Math.round(Number(pursuit.distance)) : null,
      speed: Number.isFinite(Number(pursuit.speed)) ? Math.round(Number(pursuit.speed)) : null,
      moving: Boolean(pursuit.moving),
      active: Boolean(pursuit.active),
      reason: pursuit.reason || '',
      durationMs: Math.max(0, Math.round(Number(pursuit.durationMs ?? (lastSeenAt - Number(pursuit.startedAt || lastSeenAt))))),
      thresholdMs: cfg.pursuitLeaveMs,
      lastSeenAgeMs: Math.max(0, Math.round(t - lastSeenAt)),
      towardScore: Number.isFinite(Number(pursuit.towardScore)) ? Number(pursuit.towardScore).toFixed(2) : null,
      closingDistance: Number.isFinite(Number(pursuit.closingDistance)) ? Math.round(Number(pursuit.closingDistance)) : null
    };
  }

  function summarizePendingCombatLeave(pending = bot.pendingCombatLeave) {
    if (!pending) return null;
    return {
      reason: pending.reason || '',
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
      target: action?.target || previous.target || null,
      combatState: action?.combatState || previous.combatState || null,
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
      dx: 0,
      dy: 0,
      target: pending.target || null,
      combatState: pending.combatState || null
    };
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
      thresholdMs: cfg.pursuitLeaveMs
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

  async function issueLeaveCommand(detail) {
    try {
      if (typeof leave === 'function') {
        const result = detail.userId ? leave(detail.userId) : leave();
        detail.attempted = true;
        detail.method = detail.userId ? 'leave(userId)' : 'leave';
        if (result && typeof result.then === 'function') {
          await waitWithTimeout(result, cfg.leaveCommandTimeoutMs, 'leave request');
        }
      } else {
        const leaveBtn = document.querySelector('#leaveBtn');
        if (leaveBtn && isVisible(leaveBtn)) {
          leaveBtn.click();
          detail.attempted = true;
          detail.method = '#leaveBtn';
        } else {
          detail.error = 'leave control not found';
        }
      }
    } catch (err) {
      detail.error = err?.message || String(err);
    }
    return detail;
  }

  async function maybeStartAutoLogin(reason) {
    if (syncPausedFromPage()) {
      return {
        needed: false,
        attempted: false,
        reason: 'paused',
        error: '',
        hasToken: Boolean(getSessionToken()),
        currentUserId: getCurrentUserId()
      };
    }
    if (!cfg.autoLogin || cfg.dryRun || cfg.once) return null;
    const t = Date.now();
    const suppressRemainingMs = loginSuppressRemainingMs();
    if (suppressRemainingMs > 0) {
      return {
        needed: true,
        attempted: false,
        reason: 'suppressed',
        cooldownRemainingMs: Math.round(suppressRemainingMs),
        error: '',
        suppressReason: localStorage.getItem('graspRatLoginSuppressReason') || 'login flow',
        hasToken: Boolean(getSessionToken()),
        currentUserId: getCurrentUserId()
      };
    }
    const userId = getCurrentUserId();
    const hasToken = Boolean(getSessionToken());
    const loginControl = findLoginControl();
    const loginRequired = hasLoginRequiredText();
    const needsLogin = !hasToken || loginRequired;
    if (!needsLogin) return null;
    if (t - Number(bot.lastLoginAt || 0) < cfg.loginCooldownMs) {
      const lastError = bot.lastLoginResult?.error || '';
      return {
        needed: true,
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.loginCooldownMs - (t - Number(bot.lastLoginAt || 0)))),
        error: lastError,
        hasToken,
        currentUserId: userId
      };
    }
    const detail = {
      needed: true,
      attempted: false,
      reason,
      hasToken,
      currentUserId: userId,
      loginRequired,
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
    postDebugEvent(detail.error ? 'login-error' : 'login', detail, { force: true });
    return detail;
  }

  async function leaveOffline(reason, selfSummary = null, offlineSafety = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    const retryMs = Math.max(200, Number(cfg.offlineLeaveRetryMs || cfg.combatLeaveRetryMs || 1000));
    if (t - Number(bot.lastOfflineLeaveAt || 0) < retryMs) {
      return {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastOfflineLeaveAt || 0)))),
        offlineSafety
      };
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      offlineSafety,
      error: ''
    };
    bot.lastOfflineLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted && !detail.error) setOfflineLeaveSuppress(reason || 'websocket offline', detail, selfSummary);
    bot.lastOfflineLeaveResult = detail;
    postDebugEvent(detail.error ? 'leave-error' : 'leave-offline', detail, { force: true });
    return detail;
  }

  async function leaveForInjury(injury) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    if (t - Number(bot.lastInjuryLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      return {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastInjuryLeaveAt || 0)))),
        injury
      };
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'injury hp drop',
      userId: getCurrentUserId() || null,
      injury,
      error: ''
    };
    bot.lastInjuryLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted && !detail.error) {
      setEnemyLeaveSuppress('injury hp drop', detail, injury?.self || injury);
      bot.pendingInjuryLeave = null;
    }
    bot.lastInjuryLeaveResult = detail;
    postDebugEvent(detail.error ? 'injury-leave-error' : 'injury-leave', detail, { force: true });
    return detail;
  }

  async function leaveForPursuit(pursuit, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    if (t - Number(bot.lastPursuitLeaveAt || 0) < cfg.pursuitLeaveRetryMs) {
      return {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.pursuitLeaveRetryMs - (t - Number(bot.lastPursuitLeaveAt || 0)))),
        pursuit: summarizePursuit(pursuit)
      };
    }
    const detail = {
      attempted: false,
      method: '',
      reason: 'sustained pursuit',
      userId: getCurrentUserId() || null,
      self: selfSummary,
      pursuit: summarizePursuit(pursuit),
      error: ''
    };
    bot.lastPursuitLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted && !detail.error) {
      setEnemyLeaveSuppress('sustained pursuit', detail, selfSummary);
      bot.pursuit = null;
      if (bot.lastSafety) bot.lastSafety.pursuit = null;
    }
    bot.lastPursuitLeaveResult = detail;
    postDebugEvent(detail.error ? 'pursuit-leave-error' : 'pursuit-leave', detail, { force: true });
    return detail;
  }

  async function leaveForCombat(action, selfSummary = null) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    if (t - Number(bot.lastCombatLeaveAt || 0) < cfg.combatLeaveRetryMs) {
      const detail = {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.combatLeaveRetryMs - (t - Number(bot.lastCombatLeaveAt || 0)))),
        combat: action?.combatState || null,
        target: action?.target || null
      };
      rememberPendingCombatLeave(action, selfSummary, detail);
      return detail;
    }
    const reason = action?.reason === 'combat-critical-hp-leave'
      ? 'combat critical hp'
      : action?.reason === 'combat-hp-disadvantage-leave'
        ? 'combat hp disadvantage'
        : 'combat low hp disadvantage';
    const detail = {
      attempted: false,
      method: '',
      reason,
      userId: getCurrentUserId() || null,
      self: selfSummary,
      target: action?.target || null,
      combat: action?.combatState || null,
      error: ''
    };
    bot.lastCombatLeaveAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted && !detail.error) {
      setEnemyLeaveSuppress(reason, detail, selfSummary);
      bot.pendingCombatLeave = null;
    } else {
      rememberPendingCombatLeave(action, selfSummary, detail);
    }
    bot.lastCombatLeaveResult = detail;
    postDebugEvent(detail.error ? 'combat-leave-error' : 'combat-leave', detail, { force: true });
    return detail;
  }

  async function leaveDuringEnemyHold(reason = 'enemy leave wait') {
    const t = Date.now();
    const retryMs = Math.max(cfg.pursuitLeaveRetryMs, cfg.combatLeaveRetryMs);
    if (cfg.dryRun || cfg.once) return null;
    if (t - Number(bot.lastEnemyLeaveRetryAt || 0) < retryMs) {
      return {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(retryMs - (t - Number(bot.lastEnemyLeaveRetryAt || 0)))),
        holdRemainingMs: enemyReloginHoldRemainingMs()
      };
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      userId: getCurrentUserId() || null,
      holdRemainingMs: enemyReloginHoldRemainingMs(),
      error: ''
    };
    bot.lastEnemyLeaveRetryAt = t;
    await issueLeaveCommand(detail);
    if (detail.attempted && !detail.error) bot.pendingCombatLeave = null;
    detail.holdRemainingMs = enemyReloginHoldRemainingMs();
    bot.lastEnemyLeaveRetryResult = detail;
    postDebugEvent(detail.error ? 'enemy-leave-retry-error' : 'enemy-leave-retry', detail, { force: true });
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
	    if (!userId || !token) {
	      closeControlWs('missing login token');
	      return false;
	    }
	    const native = getNativeControl();
	    if (native) {
	      if (bot.control.ws) closeControlWs();
	      if (syncNativeControl(native)) return true;
	      if (native.wsReadyState === WebSocket.CONNECTING) return false;
	      bot.control.lastError = 'native page websocket offline; page owns reconnect';
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

  function getNativeCoinList() {
    const nativeState = getNativeState();
    if (!nativeState) return null;
    for (const key of ['coinDrops', 'coin_drops', 'coins', 'drops']) {
      if (Array.isArray(nativeState[key])) return nativeState[key];
    }
    return null;
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
	
  function normalizeCoinDrop(raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const amount = Number(raw.amount ?? raw.value ?? raw.coins ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amount) || amount <= 0) return null;
    const dropId = raw.drop_id ?? raw.id ?? raw.coin_id;
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

  function nativeCoinMatchesSnapshot(snapshotCoin, nativeCoins) {
    if (!snapshotCoin || !Array.isArray(nativeCoins) || !nativeCoins.length) return false;
    const snapshotId = snapshotCoin.drop_id ?? snapshotCoin.id ?? snapshotCoin.coin_id;
    const snapshotPoint = { x: Number(snapshotCoin.x), y: Number(snapshotCoin.y) };
    const matchRadius = Math.max(100, Number(cfg.coinCollectedPruneRadius || 900));
    return nativeCoins.some(nativeCoin => {
      const nativeId = nativeCoin?.drop_id ?? nativeCoin?.id ?? nativeCoin?.coin_id;
      if (snapshotId !== undefined && snapshotId !== null && snapshotId !== ''
        && nativeId !== undefined && nativeId !== null && nativeId !== ''
        && String(snapshotId) === String(nativeId)) return true;
      const nativePoint = { x: Number(nativeCoin?.x), y: Number(nativeCoin?.y) };
      if (!Number.isFinite(snapshotPoint.x) || !Number.isFinite(snapshotPoint.y)
        || !Number.isFinite(nativePoint.x) || !Number.isFinite(nativePoint.y)) return false;
      return dist(snapshotPoint, nativePoint) <= matchRadius;
    });
  }

  function snapshotCoinAllowed(self, coin, nativeCoins = null) {
    const distance = self ? dist(self, coin) : Infinity;
    const authoritativeRadius = Number(cfg.nativeCoinAuthoritativeRadius || 0);
    if (!Number.isFinite(distance) || distance > authoritativeRadius) return true;
    if (nativeCoinMatchesSnapshot(coin, nativeCoins)) return true;
    const fallbackMax = Math.max(0, Number(cfg.snapshotCoinLocalFallbackMaxDistance || cfg.coinMaxDistance || 0));
    return distance <= fallbackMax;
  }

  function snapshotCoinFreshEnough() {
    return snapshotDataFreshEnough();
  }

  function getCoins(self = null) {
    const nativeCoinList = getNativeCoinList();
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
        if (!normalized || !snapshotCoinAllowed(self, normalized, nativeCoins)) continue;
        add(normalized, 'snapshot');
      }
    }
    for (const coin of nativeCoins) add(coin, 'native');
    return Array.from(byKey.values());
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
    const request = fetch(url, options).then(res => res.json());
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

  async function refreshServerPositionProbeIfNeeded() {
    if (!cfg.serverPositionStallEnabled || !currentVelocityCommandActive()) return;
    const t = Date.now();
    const probeMs = Math.max(250, Number(cfg.serverPositionStallProbeMs || 1000));
    if (t - Number(bot.serverPositionProbeAt || 0) < probeMs) return;
    bot.serverPositionProbeAt = t;
    try {
      await refreshGlobalState(true);
    } catch (err) {
      bot.globalState.error = err.message || String(err);
    }
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
    } else if (session.userId === null && userId !== null) {
      session.userId = userId;
    }
    session.missingSince = 0;
    if (!Number.isFinite(Number(session.baseCoins))) session.baseCoins = Number.isFinite(coins) ? coins : 0;
    if (!Number.isFinite(Number(session.coinPickupTotal))) session.coinPickupTotal = 0;
    if (!Array.isArray(session.coinPickupKeys)) session.coinPickupKeys = [];
    const coinDiff = Math.max(0, Math.round((Number.isFinite(coins) ? coins : 0) - Number(session.baseCoins || 0)));
    session.coinsGained = Math.max(
      Math.max(0, Number(session.coinsGained || 0) || 0),
      Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      coinDiff
    );
    const killCount = bot.killHistory.filter(item => Number(item?.at || 0) >= Number(session.startedAt || 0)).length;
    session.kills = Math.max(Math.max(0, Number(session.kills || 0) || 0), killCount);
  }

  function summarizeSessionStats(selfSummary) {
    const session = bot.session || {};
    const startedAt = Number(session.startedAt || 0);
    return {
      startedAt,
      uptimeMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0,
      baseCoins: Number.isFinite(Number(session.baseCoins)) ? Number(session.baseCoins) : null,
      coins: Number(selfSummary?.coins || 0),
      coinsGained: Math.max(0, Number(session.coinsGained || 0) || 0),
      coinPickupTotal: Math.max(0, Number(session.coinPickupTotal || 0) || 0),
      kills: Math.max(0, Number(session.kills || 0) || 0),
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
    for (const entity of entities) {
      const id = Number(entity.user_id);
      if (!id) continue;
      const x = Number(entity.x);
      const y = Number(entity.y);
      const previous = bot.seenEntities.get(id);
      let movedAt = previous?.movedAt || 0;
      if (previous && Math.hypot(x - previous.x, y - previous.y) >= cfg.activeMoveMin) {
        movedAt = t;
      }
      entity.recentlyMoved = t - movedAt <= cfg.activeSeenMs;
      bot.seenEntities.set(id, { x, y, seenAt: t, movedAt });
    }
    for (const [id, seen] of bot.seenEntities.entries()) {
      if (t - seen.seenAt > 10000) bot.seenEntities.delete(id);
    }
  }

	  async function refreshGlobalState(force = false) {
	    const t = Date.now();
	    if (!force && t - bot.globalState.refreshedAt < cfg.globalRefreshMs) return;
	    bot.globalState.refreshedAt = t;
	    try {
      const [snapshotRes, minimapRes] = await Promise.all([
        fetchJsonNoStore('/snapshot'),
        fetchJsonNoStore('/minimap')
	      ]);
		      const [snapshot, minimap] = [snapshotRes, minimapRes];
			      bot.globalState.tick = Number(snapshot?.tick || bot.globalState.tick || 0);
			      bot.globalState.entities = snapshot?.entities || [];
			      bot.globalState.bullets = snapshot?.bullets || [];
			      bot.globalState.coinDrops = snapshot?.coin_drops || [];
		      bot.globalState.messages = snapshot?.messages || [];
      bot.globalState.snapshotRefreshedAt = Date.now();
		      bot.globalState.minimap = minimap || null;
	      bot.globalState.error = '';
	    } catch (err) {
	      bot.globalState.error = err.message || String(err);
	    }
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

  function stopLocalMotionOnly(reason = '') {
    const nativeState = getNativeState();
    if (nativeState) {
      setNativeKeys(nativeState, 0, 0);
      if (nativeState.currentVel && typeof nativeState.currentVel === 'object') {
        nativeState.currentVel.dx = 0;
        nativeState.currentVel.dy = 0;
      }
      if (nativeState.touchMove) {
        nativeState.touchMove.active = false;
        nativeState.touchMove.dx = 0;
        nativeState.touchMove.dy = 0;
      }
    }
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
      return sendNativeVelocity(0, 0, true) || stopLocalMotionOnly(reason);
    }
    return stopLocalMotionOnly(reason);
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

    if (distance <= cfg.coinPickupSweepDistance) {
      const pulse = Math.max(60, Number(cfg.coinPickupPulseMs) || 180);
      const sweepPulseMs = Math.max(30, Number(cfg.coinPickupSweepPulseMs) || 80);
      const finePulseMs = Math.max(25, Number(cfg.coinPickupFinePulseMs) || 45);
      const precisionPulseMs = distance <= cfg.coinPickupFineDistance ? finePulseMs : sweepPulseMs;
      const locked = (next, extra = {}) => {
        if (next.dx || next.dy) {
          bot.coinApproachLock = { id, dx: next.dx, dy: next.dy, until: t + pulse };
          return { ...next, distance, pickupSweep: true, locked: Boolean(sameLock), precisionPulseMs, ...extra };
        }
        return { dx: 0, dy: 0, distance, pickupSweep: true, ...extra };
      };
      const dominantAxis = () => absX >= absY
        ? { dx: Math.sign(dxRaw) || (sameLock ? lock.dx : 0), dy: 0 }
        : { dx: 0, dy: Math.sign(dyRaw) || (sameLock ? lock.dy : 0) };

      if (distance <= cfg.coinPickupMicroDistance) {
        const phase = Math.floor(t / pulse) % 6;
        if (phase === 0 || phase === 3) return locked({ dx: 0, dy: 0 }, { pickupMicro: true });
        if (absX > cfg.coinPickupStopDistance || absY > cfg.coinPickupStopDistance) {
          return locked(dominantAxis(), { pickupMicro: true, pushThrough: true });
        }
        const pattern = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 }
        ];
        return locked(pattern[Math.floor(t / (pulse * 2)) % pattern.length], { pickupMicro: true, crossSweep: true });
      }

      if (distance <= cfg.coinPickupFineDistance) {
        if (Math.floor(t / pulse) % 4 === 3) return locked({ dx: 0, dy: 0 }, { pickupFine: true });
        return locked(dominantAxis(), { pickupFine: true, pushThrough: true });
      }

      if (Math.floor(t / pulse) % 3 === 2) return locked({ dx: 0, dy: 0 });
      return locked(dominantAxis());
    }

    if (distance <= tolerance) {
      if (sameLock) return { dx: lock.dx, dy: lock.dy, distance, locked: true, pushThrough: true };
      bot.coinApproachLock = null;
      return { dx: 0, dy: 0, distance };
    }
    if (distance <= cfg.nearCoinStuckDistance && Math.max(absX, absY) > tolerance) {
      if (sameLock) {
        const axisRaw = lock.dx ? dxRaw : dyRaw;
        const axisSign = lock.dx || lock.dy;
        if (Math.sign(axisRaw) === axisSign || Math.abs(axisRaw) <= cfg.coinAxisFlipTolerance) {
          return { dx: lock.dx, dy: lock.dy, distance, locked: true };
        }
      }
      const next = absX >= absY
        ? { dx: Math.sign(dxRaw), dy: 0 }
        : { dx: 0, dy: Math.sign(dyRaw) };
      bot.coinApproachLock = { id, dx: next.dx, dy: next.dy, until: t + cfg.coinApproachLockMs };
      return { ...next, distance };
    }
    if (distance <= cfg.nearCoinStuckDistance) {
      const next = absX >= absY
        ? { dx: Math.sign(dxRaw), dy: 0 }
        : { dx: 0, dy: Math.sign(dyRaw) };
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
    if (dir?.pickupMicro) meta.pickupMode = dir.crossSweep ? 'micro-cross-sweep' : 'micro';
    else if (dir?.pickupFine) meta.pickupMode = 'fine';
    else if (dir?.pickupSweep) meta.pickupMode = 'sweep';
    if (dir?.locked) meta.motionLocked = true;
    if (dir?.pushThrough) meta.pushThrough = true;
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
	    const snapshotCoins = allCoins.filter(c => c.distance <= cfg.snapshotCoinMaxDistance);
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
    const combatThreat = combatTargets.find(entity => !isAfkTarget(entity) && entity.distance <= cfg.combatAttackRange) || null;
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

  function safeCoinCandidates(coins, activeThreats, maxDistance) {
    const t = now();
    for (const [id, until] of bot.ignoredCoins.entries()) {
      if (until <= t) bot.ignoredCoins.delete(id);
    }
    return coins.filter(c => c.distance <= maxDistance
      && !bot.ignoredCoins.has(String(c.drop_id))
      && !activeThreats.some(t => dist(c, t) <= (t.coinDangerRadius ?? cfg.coinDangerRadius)))
      .sort(compareCoinOpportunity);
  }

  function pickCoin(coins, activeThreats, maxDistance) {
    const candidates = safeCoinCandidates(coins, activeThreats, maxDistance);
    if (!candidates.length) return null;
    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
      if (sticky) return sticky;
    }
    return candidates[0];
  }

  function pickCoinField(self, allCoins, activeThreats) {
    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.fieldMigrationMaxDistance)
      .filter(c => c.distance >= cfg.fieldMigrationMinDistance)
      .filter(c => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(c)));
    if (!candidates.length) return null;
    let best = null;
    for (const coin of candidates.slice(0, 80)) {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) continue;
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const staminaCost = opportunityCoinStaminaCost(coin);
      const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
      const item = {
        ...coin,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        fieldScore: score,
        opportunityStaminaCost: staminaCost
      };
      if (!best || item.fieldScore > best.fieldScore) best = item;
    }
    return best;
  }

  function pickDistantCoin(self, allCoins, activeThreats) {
    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.distantCoinMaxDistance)
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
      + Number(target.drop || 0) * 1000000
      - Number(target.distance || 0);
  }

  function isDefensiveCombatTarget(target, incomingOwnerId = null, unknownIncoming = false) {
    if (!target || isWhitelistedTarget(target) || isAfkTarget(target) || isInvulnerable(target)) return false;
    if (incomingOwnerId !== null && incomingOwnerId !== undefined && String(target.user_id) === String(incomingOwnerId)) return true;
    if (isFiringEntity(target)) return true;
    if (unknownIncoming && isCurrentlyActive(target)) return true;
    return Boolean(recentCombatInjuryActive() && isCurrentlyActive(target));
  }

  function isProfitableCombatTarget(target) {
    return Boolean(target && !isWhitelistedTarget(target) && !isAfkTarget(target) && !isInvulnerable(target) && Number(target.drop || 0) > 0);
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
    const eligibleTargets = combatTargets.filter(target => !isWhitelistedTarget(target) && !isAfkTarget(target) && !isInvulnerable(target));
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
    if (!raw || !entityFreshEnoughForOffense(raw) || !isAlive(raw) || isWhitelistedTarget(raw) || isAfkTarget(raw) || isInvulnerable(raw)) return null;
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
    if (target && !isWhitelistedTarget(target) && !isAfkTarget(target) && !isInvulnerable(target)) {
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

  function pickOpportunisticShotTarget(self, entities) {
    const candidates = (entities || [])
      .filter(e => Number(e.user_id) !== Number(self.user_id))
      .filter(entityFreshEnoughForOffense)
      .filter(isAlive)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), hp: combatHpValue(e) }))
      .filter(e => !isWhitelistedTarget(e))
      .filter(e => e.distance <= cfg.attackRange)
      .filter(e => attackWorthTaking(self, e) && !isInvulnerable(e))
      .filter(isAfkTarget)
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

  function combatStrafeVector(self, target, pressure, sign) {
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
    if (target) {
      const awayX = Math.sign(Number(self.x) - Number(target.x)) || 0;
      const awayY = Math.sign(Number(self.y) - Number(target.y)) || 0;
      if (dx && !dy && awayY) dy = awayY;
      else if (dy && !dx && awayX) dx = awayX;
    }
    if (!(dx || dy) && target) {
      dx = Math.sign(Number(self.y) - Number(target.y)) || 1;
      dy = Math.sign(Number(target.x) - Number(self.x)) || 0;
    }
    return { dx: clamp(Math.round(dx), -1, 1), dy: clamp(Math.round(dy), -1, 1) };
  }

  function tangentMoveForBullet(self, target, pressure) {
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
    const signedLane = Number(pressure?.signedLaneDistance);
    const preciseSign = !pressure?.synthetic && Number.isFinite(signedLane) && Math.abs(signedLane) > 1
      ? -Math.sign(signedLane)
      : 0;
    let sign = 0;
    let until = 0;
    if (existing && existing.key === key && t < Number(existing.until || 0)) {
      sign = Number(existing.sign || 0);
      until = Number(existing.until || 0);
    }
    if (!sign) {
      sign = preciseSign || (Math.random() < 0.5 ? -1 : 1);
      until = t + combatStrafeHoldMs();
    }

    let { dx, dy } = combatStrafeVector(self, target, pressure, sign);
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
      locked: Boolean(existing && existing.key === key && t < Number(existing.until || 0)),
      carried: false,
      active: true,
      sign,
      precise: Boolean(preciseSign),
      key,
      holdRemainingMs: Math.max(0, Math.round(until - t)),
      carryRemainingMs: carryMs
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

  function combatAimJitterLimit(distance) {
    const maxJitter = Math.max(0, Number(cfg.combatAimJitterMaxRadians || cfg.combatAimJitterRadians || 0));
    const minJitter = clamp(Number(cfg.combatAimJitterMinRadians ?? maxJitter), 0, maxJitter);
    const closeDistance = Math.max(0, Number(cfg.combatAimJitterCloseDistance || 0));
    const farDistance = Math.max(closeDistance + 1, Number(cfg.combatAimJitterFarDistance || cfg.combatAttackRange || closeDistance + 1));
    const rawDistance = Number(distance);
    const d = clamp(Number.isFinite(rawDistance) ? rawDistance : farDistance, closeDistance, farDistance);
    const nearFactor = 1 - ((d - closeDistance) / (farDistance - closeDistance));
    return minJitter + (maxJitter - minJitter) * nearFactor;
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
    const afk = isAfkTarget(target);
    const stopDistance = afk ? cfg.attackRange : cfg.attackEngageRange;
    const moveCost = opportunityMoveStaminaCost(target?.distance, stopDistance);
    const shotCost = estimatedKillShots(target) * Math.max(0, Number(cfg.opportunityShotStaminaCostMs || 500));
    return moveCost + shotCost;
  }

  function opportunityLongStaminaBudget(self) {
    const values = ['1h', '1d']
      .map(key => staminaRemaining(self, key))
      .filter(value => Number.isFinite(value));
    if (!values.length) return Infinity;
    const reserve = staminaExhaustedThreshold() + Math.max(0, Number(cfg.opportunityLongStaminaReserveMs || 0));
    return Math.max(0, Math.min(...values) - reserve);
  }

  function opportunityStaminaAffordable(self, staminaCost) {
    const cost = Number(staminaCost);
    if (!Number.isFinite(cost) || cost <= 0) return true;
    const budget = opportunityLongStaminaBudget(self);
    return !Number.isFinite(budget) || cost <= budget;
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
    const moving = speed(target) >= cfg.combatStationarySpeed || Boolean(target.recentlyMoved);
    const targetDistance = Number(target.distance);
    const distance = Number.isFinite(targetDistance) ? targetDistance : dist(self, target);
    const exact = {
      x: Number(target.x),
      y: Number(target.y),
      mode: 'exact',
      moving,
      distance
    };
    if (!moving) return exact;
    const dx = Number(target.x) - Number(self.x);
    const dy = Number(target.y) - Number(self.y);
    const baseLimit = combatAimJitterLimit(distance);
    const damage = combatAimDamageState(target);
    const stepMs = Math.max(1, Number(cfg.combatAimNoDamageStepMs) || 800);
    const noDamageLevel = damage.widenMs > 0 ? Math.min(3, 1 + damage.widenMs / stepMs) : 0;
    const maxNoDamageLimit = Math.max(baseLimit, Number(cfg.combatAimNoDamageMaxRadians) || baseLimit);
    const jitterLimit = noDamageLevel
      ? Math.min(maxNoDamageLimit, baseLimit * (1 + noDamageLevel * 0.45))
      : baseLimit;
    const movement = combatMovementAimMode(self, target, distance);
    const targetId = combatTargetId(target);
    const previousAim = bot.combatAim;
    let sign = Math.sign(movement.lateralSpeed || 0);
    if (!sign && previousAim && String(previousAim.targetId || '') === targetId) sign = Math.sign(Number(previousAim.sign || 0));
    if (!sign) sign = Math.random() < 0.5 ? -1 : 1;
    const noDamageBucket = noDamageLevel ? Math.floor(damage.widenMs / stepMs) + 1 : 0;
    let angle = 0;
    const locked = previousAim
      && String(previousAim.targetId || '') === targetId
      && String(previousAim.movementMode || '') === movement.mode
      && Number(previousAim.noDamageBucket || 0) === noDamageBucket
      && now() < Number(previousAim.until || 0)
      && Number.isFinite(Number(previousAim.angle));
    if (locked) {
      angle = Number(previousAim.angle);
      sign = Math.sign(Number(previousAim.sign || sign)) || sign;
    } else {
      const minLead = Math.min(jitterLimit, Math.max(0, Number(cfg.combatAimLeadMinRadians) || 0));
      const lead = Math.min(jitterLimit, Math.max(minLead, jitterLimit * movement.leadScale));
      const randomSpread = jitterLimit * (noDamageLevel ? 0.35 : 0.22);
      angle = sign * lead + (Math.random() * 2 - 1) * randomSpread;
      if (Math.abs(angle) < minLead && minLead > 0) angle = sign * minLead;
      angle = clamp(angle, -jitterLimit, jitterLimit);
      bot.combatAim = {
        targetId,
        angle,
        sign,
        movementMode: movement.mode,
        noDamageBucket,
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
      movementMode: movement.mode,
      radialSpeed: movement.radialSpeed,
      lateralSpeed: movement.lateralSpeed,
      noDamageMs: damage.noDamageMs,
      noDamageWidened: Boolean(noDamageLevel),
      lockedAim: Boolean(locked)
    };
  }

  function buildCombatAction(self, target, bullets) {
    const selfHp = hpValue(self);
    const targetHp = combatHpValue(target);
    const targetDistance = Number.isFinite(Number(target.distance)) ? Number(target.distance) : dist(self, target);
    const baseTarget = {
      id: target.user_id,
      name: target.name,
      x: target.x,
      y: target.y,
      hp: targetHp,
      knownHp: knownHpValue(target),
      drop: target.drop,
      distance: Math.round(targetDistance),
      moving: speed(target) >= cfg.combatStationarySpeed || Boolean(target.recentlyMoved),
      combatIntent: target.combatIntent || '',
      score: Number.isFinite(Number(target.combatOpportunityScore)) ? Number(target.combatOpportunityScore) : null,
      competingCoinScore: Number.isFinite(Number(target.competingCoinScore)) ? Number(target.competingCoinScore) : null
    };
    if (selfHp < cfg.combatCriticalHpLeaveThreshold) {
      return {
        kind: 'leave',
        reason: 'combat-critical-hp-leave',
        combat: true,
        ignoreReturnBlock: true,
        dx: 0,
        dy: 0,
        target: baseTarget,
        combatState: { selfHp, targetHp }
      };
    }
    if (selfHp < cfg.combatLowHpLeaveThreshold && selfHp < targetHp) {
      return {
        kind: 'leave',
        reason: 'combat-low-hp-leave',
        combat: true,
        ignoreReturnBlock: true,
        dx: 0,
        dy: 0,
        target: baseTarget,
        combatState: { selfHp, targetHp }
      };
    }
    const knownSelfHp = knownHpValue(self);
    const knownTargetHp = knownHpValue(target);
    const hpGap = Number(knownTargetHp) - Number(knownSelfHp);
    if (knownSelfHp > cfg.combatLowHpLeaveThreshold
      && Number.isFinite(hpGap)
      && hpGap > cfg.combatHighHpDisadvantageGap) {
      return {
        kind: 'leave',
        reason: 'combat-hp-disadvantage-leave',
        combat: true,
        ignoreReturnBlock: true,
        dx: 0,
        dy: 0,
        target: baseTarget,
        combatState: { selfHp, targetHp, hpGap }
      };
    }
    if (targetDistance > Number(cfg.combatAttackRange || 0)) {
      const dir = directionTo(self, target);
      return {
        kind: 'seek-enemy',
        reason: 'combat-reengage',
        combat: true,
        ignoreReturnBlock: true,
        shoot: false,
        forceShoot: false,
        dx: dir.dx,
        dy: dir.dy,
        target: baseTarget,
        combatState: {
          selfHp,
          targetHp,
          reengage: {
            distance: Math.round(targetDistance),
            attackRange: Math.round(Number(cfg.combatAttackRange || 0)),
            outOfRangeMs: target.combatEngagement?.outOfRangeMs || 0,
            graceRemainingMs: target.combatEngagement?.graceRemainingMs || 0
          }
        }
      };
    }
    const pressure = combatPressureThreat(self, target, bullets);
    const strafe = tangentMoveForBullet(self, target, pressure);
    const dodging = Boolean(pressure || strafe.active);
    const aim = combatAimTarget(self, target);
    return {
      kind: 'attack',
      reason: dodging ? 'combat-tangent-dodge' : 'combat-attack',
      combat: true,
      ignoreReturnBlock: true,
      shoot: true,
      forceShoot: true,
      shootEveryMs: cfg.combatShootEveryMs,
      dx: dodging ? strafe.dx : 0,
      dy: dodging ? strafe.dy : 0,
      target: baseTarget,
      aimTarget: {
        x: aim.x,
        y: aim.y,
        mode: aim.mode,
        angle: Number.isFinite(aim.angle) ? Number(aim.angle.toFixed(4)) : 0,
        jitterLimit: Number.isFinite(aim.jitterLimit) ? Number(aim.jitterLimit.toFixed(4)) : 0,
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
          noDamageMs: Number.isFinite(Number(aim.noDamageMs)) ? Math.round(Number(aim.noDamageMs)) : 0,
          widened: Boolean(aim.noDamageWidened),
          locked: Boolean(aim.lockedAim)
        },
        strafe: dodging ? {
          dx: strafe.dx,
          dy: strafe.dy,
          sign: strafe.sign,
          precise: Boolean(strafe.precise),
          locked: Boolean(strafe.locked),
          carried: Boolean(strafe.carried),
          holdRemainingMs: strafe.holdRemainingMs || 0,
          carryRemainingMs: strafe.carryRemainingMs || 0
        } : null
      }
    };
  }

  function snapshotCoinAgeMs() {
    return bot.globalState.snapshotRefreshedAt ? Math.max(0, Date.now() - Number(bot.globalState.snapshotRefreshedAt || 0)) : Infinity;
  }

  function pickSnapshotCoinDestination(self, allCoins, activeThreats) {
    const ageMs = snapshotCoinAgeMs();
    let candidates = safeCoinCandidates(allCoins, activeThreats, cfg.snapshotCoinMaxDistance);
    if (ageMs > cfg.snapshotCoinStaleMs) {
      candidates = candidates.filter(coin => coin.native);
    }
    candidates = candidates.filter(coin => opportunityStaminaAffordable(self, opportunityCoinStaminaCost(coin)));
    if (!candidates.length) return null;
    if (bot.lastTarget?.kind === 'coin' && now() - bot.lastTargetAt < cfg.coinStickMs) {
      const sticky = candidates.find(c => String(c.drop_id) === String(bot.lastTarget.id));
      if (sticky) {
        const members = candidates.filter(other => dist(sticky, other) <= Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius));
        const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        if (snapshotCoinWorthLongTravel(sticky, members.length, totalAmount)) {
          const staminaCost = opportunityCoinStaminaCost(sticky);
          const score = opportunityValueScore(totalAmount, staminaCost, cfg.coinOpportunityValue);
          return { ...sticky, snapshotMembers: members.length, snapshotAmount: totalAmount, snapshotScore: score, opportunityScore: score, opportunityStaminaCost: staminaCost, snapshotAgeMs: ageMs };
        }
      }
    }
    let best = null;
    const radius = Number(cfg.snapshotCoinClusterRadius || cfg.fieldMigrationClusterRadius);
    const minCoins = Math.max(1, Number(cfg.snapshotCoinClusterMinCoins || 1));
    for (const coin of candidates.slice(0, 300)) {
      const members = candidates.filter(other => dist(coin, other) <= radius);
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (!snapshotCoinWorthLongTravel(coin, members.length, totalAmount)) continue;
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
      if (!best
        || item.snapshotScore > best.snapshotScore
        || (item.snapshotScore === best.snapshotScore && members.length >= minCoins && best.snapshotMembers < minCoins)
        || (item.snapshotScore === best.snapshotScore && item.distance < best.distance)) best = item;
    }
    if (best) return { ...best, opportunityScore: best.snapshotScore };
    return null;
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

  function scoreCoinOpportunity(coin) {
    const override = Number(coin?.opportunityScore ?? coin?.snapshotScore ?? NaN);
    if (Number.isFinite(override)) return override;
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    return opportunityValueScore(coin.amount, opportunityCoinStaminaCost(coin), cfg.coinOpportunityValue)
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function scoreEnemyOpportunity(target) {
    if (isWhitelistedTarget(target)) return null;
    const afk = isAfkTarget(target);
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

  function bestCoinOpportunityScore(self, coinGroups, activeThreats) {
    let best = -Infinity;
    for (const { coins: groupCoins, maxDistance } of coinGroups) {
      for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance)) {
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
    for (const coin of safeCoinCandidates(coins, activeThreats, cfg.postAttackDropCoinMaxDistance)
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
    const afk = isAfkTarget(target);
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

  function rememberOpportunityChoice(item, action, previous = bot.opportunityChoice) {
    if (!item) return action;
    const t = now();
    const key = opportunityKey(item);
    const same = previous && String(previous.key || '') === key;
    bot.opportunityChoice = {
      key,
      type: item.type || '',
      id: item.id ?? '',
      at: same ? Number(previous.at || t) : t,
      lastSeenAt: t,
      until: t + Math.max(0, Number(cfg.opportunitySwitchHoldMs) || 0),
      score: Math.round(Number(item.score || 0)),
      staminaCost: Number.isFinite(Number(item.staminaCost)) ? Math.round(Number(item.staminaCost)) : null,
      reason: action?.reason || ''
    };
    return {
      ...action,
      opportunityChoice: {
        type: bot.opportunityChoice.type,
        id: bot.opportunityChoice.id,
        score: bot.opportunityChoice.score,
        staminaCost: bot.opportunityChoice.staminaCost,
        held: Boolean(item.held),
        competingScore: Number.isFinite(Number(item.competingScore)) ? Math.round(Number(item.competingScore)) : null,
        holdRemainingMs: Math.max(0, Math.round(Number(bot.opportunityChoice.until || 0) - t))
      }
    };
  }

  function chooseStableOpportunity(opportunities) {
    const sorted = opportunities
      .slice()
      .sort((a, b) => b.score - a.score || (a.type === b.type ? 0 : (a.type === 'enemy' ? -1 : 1)) || a.distance - b.distance);
    const best = sorted[0] || null;
    if (!best) return null;
    const current = bot.opportunityChoice;
    if (current?.key && now() < Number(current.until || 0)) {
      const held = sorted.find(item => opportunityKey(item) === String(current.key || ''));
      if (held && opportunityKey(best) !== opportunityKey(held)) {
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
      for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance)) {
        const id = String(coin.drop_id);
        const previous = coinById.get(id);
        const staminaCost = opportunityCoinStaminaCost(coin);
        if (!opportunityStaminaAffordable(self, staminaCost)) continue;
        const score = scoreCoinOpportunity(coin);
        if (!previous
          || score > Number(previous.opportunitySortScore || -Infinity)
          || (score === Number(previous.opportunitySortScore || -Infinity) && Number(coin.amount || 0) > Number(previous.amount || 0))
          || (score === Number(previous.opportunitySortScore || -Infinity) && Number(coin.distance || 0) < Number(previous.distance || Infinity))) {
          coinById.set(id, { ...coin, opportunitySortScore: score, opportunityStaminaCost: staminaCost });
        }
      }
    }
    for (const coin of coinById.values()) {
      const reason = coin.snapshotMembers
        ? (coin.snapshotMembers >= cfg.snapshotCoinClusterMinCoins ? 'snapshot-coin-field' : 'snapshot-coin-target')
        : (coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin');
      opportunities.push({
        type: 'coin',
        id: coin.drop_id,
        distance: coin.distance,
        staminaCost: opportunityCoinStaminaCost(coin),
        score: Number.isFinite(Number(coin.opportunitySortScore)) ? Number(coin.opportunitySortScore) : scoreCoinOpportunity(coin),
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
        action: () => buildEnemyAction(self, target)
      });
    }

    const best = chooseStableOpportunity(opportunities);
    return best ? rememberOpportunityChoice(best, best.action()) : null;
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
    if (engagedCombatTarget) {
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
    const defensiveCombatTarget = pickCombatTarget(self, combatTargets, bullets, { mode: 'defensive' });
    if (defensiveCombatTarget) {
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
    const nearCoin = pickCoin(coins, coinThreats, nearCoinLimit);
    const footCoin = pickCoin(coins, coinThreats, cfg.footCoinPriorityDistance);
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

    const snapshotCompetitionCoin = pickSnapshotCoinDestination(self, snapshotCoins, coinThreats);
    const opportunityCoinGroups = [
      { coins, maxDistance: cfg.coinMaxDistance },
      { coins: globalCoins, maxDistance: cfg.globalCoinMaxDistance },
      { coins: patrolCoins, maxDistance: cfg.patrolCoinMaxDistance },
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
        inactiveTargets.filter(isAfkTarget),
        globalTargets.filter(target => !target.minimapOnly && isAfkTarget(target))
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

    const fieldTarget = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickCoinField(self, allCoins, coinThreats)
      : null;
    if (fieldTarget) {
      bot.fleeLock = null;
      const dir = coinDirectionTo(self, fieldTarget);
      return attachOpportunisticShot({
        kind: 'seek-coin',
        reason: 'migrate-to-known-field',
        target: {
          id: fieldTarget.drop_id,
          x: fieldTarget.x,
          y: fieldTarget.y,
          amount: fieldTarget.amount,
          distance: Math.round(dir.distance),
          fieldMembers: fieldTarget.fieldMembers,
          fieldAmount: fieldTarget.fieldAmount
        },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      }, self, entities, { recovery });
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
        snapshotCoin.snapshotMembers >= cfg.snapshotCoinClusterMinCoins ? 'snapshot-coin-field' : 'snapshot-coin-target',
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
    return {
      kind: 'wait',
      reason: 'wait-for-snapshot-coin',
      dx: 0,
      dy: 0,
      snapshot: {
	        coinDrops: arrayCount(bot.globalState.coinDrops),
        ageMs: Number.isFinite(snapshotCoinAgeMs()) ? Math.round(snapshotCoinAgeMs()) : null,
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
      const enemyHoldRemainingMs = enemyReloginHoldRemainingMs();
      if (enemyHoldRemainingMs > 0) {
        bot.pursuit = null;
        stopMotionSafely('enemy-leave-wait');
        const selfAlive = Boolean(self && isAlive(self));
        const leaveResult = selfAlive
          ? await leaveDuringEnemyHold('enemy leave wait')
          : null;
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
          holdRemainingMs: enemyReloginHoldRemainingMs(),
          leave: leaveResult,
          pursuit: bot.lastPursuitLeaveResult?.pursuit || null,
          enemyLeave: {
            lastPursuitResult: bot.lastPursuitLeaveResult,
            lastCombatResult: bot.lastCombatLeaveResult,
            lastRetryResult: bot.lastEnemyLeaveRetryResult
          }
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
		      if (!self || !isAlive(self)) {
		        bot.pursuit = null;
	        stopMotionSafely('no-self');
	        if (!bot.waitSince) bot.waitSince = Date.now();
        const login = await maybeStartAutoLogin(self ? 'not-alive' : 'no-self');
	        refreshGlobalState(false).catch(err => {
	          bot.globalState.error = err.message || String(err);
	        });
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: login?.attempted ? 'auto-login' : (login?.needed ? (login?.error ? 'login-control-missing' : 'login-cooldown') : (self ? 'not-alive' : 'no-self')),
	          currentUserId: getCurrentUserId(),
	          control: summarizeControl(),
		          visibleEntities: arrayCount(bot.globalState.entities),
	          self,
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
      const offlineHoldRemainingMs = offlineReloginHoldRemainingMs();
      if (offlineHoldRemainingMs > 0) {
        bot.pursuit = null;
        stopMotionSafely('offline-leave-wait');
        const currentSummary = summarizeSelf(self);
        const offlineSafety = bot.lastOfflineSafety || assessOfflineSafety(self);
        const leaveResult = await leaveOffline('offline leave wait', currentSummary, offlineSafety);
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
          control: summarizeControl(),
          holdRemainingMs: offlineReloginHoldRemainingMs(),
          offlineSafety,
          leave: leaveResult,
          offlineLeave: {
            lastResult: bot.lastOfflineLeaveResult,
            lastRetryResult: leaveResult
          }
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
	      bot.waitSince = 0;
	      const hadPreviousSelf = Boolean(bot.lastSelf);
	      const previousHp = Number(bot.lastSelf?.hp ?? NaN);
	      const previousDrop = Number(bot.lastSelf?.drop ?? 0);
      const previousCoins = Number(bot.lastSelf?.coins ?? 0);
      const currentSummary = summarizeSelf(self);
	      const currentHp = Number(currentSummary.hp ?? NaN);
      const staminaState = currentSummary.stamina || summarizeStamina(self);
      if (staminaState.mustLeave) {
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
      await refreshServerPositionProbeIfNeeded();
      const serverPositionStall = assessServerPositionStall(self);
      const serverPositionStallOffline = Boolean(cfg.serverPositionStallOfflineEnabled && serverPositionStall?.stalled);
      const controlOffline = !bot.control.wsOpen || serverPositionStallOffline;
		    if (!cfg.dryRun && controlOffline) {
		      bot.pursuit = null;
		      stopMotionSafely(serverPositionStallOffline ? 'server-position-stalled' : 'control-ws-offline');
		      if (!bot.offlineSince) bot.offlineSince = Date.now();
		      const offlineAgeMs = Date.now() - bot.offlineSince;
        const offlineSafety = assessOfflineSafety(self);
        const safeLeaveMs = Math.min(3000, Math.max(0, Number(cfg.offlineSafeLeaveMs ?? cfg.offlineLeaveMs ?? 3000)));
        const unsafeLeaveMs = Math.max(0, Number(cfg.offlineUnsafeLeaveMs ?? 0));
        const leaveDelayMs = offlineSafety.unsafe ? unsafeLeaveMs : safeLeaveMs;
		      const leaveResult = offlineAgeMs >= leaveDelayMs
		        ? await leaveOffline(serverPositionStallOffline ? 'server position stalled' : 'websocket offline', currentSummary, offlineSafety)
		        : null;
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: leaveResult?.attempted && !leaveResult?.error
              ? 'offline-leave'
              : (serverPositionStallOffline
                ? 'control-ws-server-position-stalled'
                : (offlineSafety.unsafe ? 'control-ws-offline-unsafe' : 'control-ws-offline-safe-wait')),
	          control: summarizeControl(),
	          self: summarizeSelf(self),
	          offlineAgeMs,
          leaveDelayMs,
          offlineSafety,
          serverPositionStall,
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
        stopMotionSafely('combat-leave-retry');
        const leaveResult = await leaveForCombat(pendingCombatLeave, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        bot.lastDecision = {
          kind: 'wait',
          reason: leaveIssued ? 'combat-leave' : 'combat-leave-retry',
          dx: 0,
          dy: 0,
          self: currentSummary,
          target: pendingCombatLeave.target || null,
          combat: true,
          combatState: pendingCombatLeave.combatState || null,
          pendingCombatLeave: summarizePendingCombatLeave(),
          leave: leaveResult,
          holdRemainingMs: enemyReloginHoldRemainingMs()
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }

      let action = chooseAction(self);
	      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
      if (bot.pendingInjuryLeave && action.combat) {
        action = {
          ...action,
          injury: {
            ...bot.pendingInjuryLeave,
            self: currentSummary,
            currentHp,
            suppressedByCombat: true
          }
        };
        bot.pendingInjuryLeave = null;
      }
      if (action.kind === 'leave' && action.combat) {
        stopMotionSafely(action.reason || 'combat-leave');
        const leaveResult = await leaveForCombat(action, currentSummary);
        const leaveIssued = Boolean(leaveResult?.attempted && !leaveResult?.error);
        bot.lastDecision = leaveIssued
          ? {
            ...action,
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
            leave: leaveResult,
            holdRemainingMs: enemyReloginHoldRemainingMs()
          };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      }
      if (bot.pendingInjuryLeave) {
        bot.pursuit = null;
        stopMotionSafely('injury-leave');
        const injury = {
          ...bot.pendingInjuryLeave,
          self: currentSummary,
          currentHp,
          nearestActive: bot.lastSafety?.nearestAvoidance || bot.lastSafety?.nearestActive || bot.pendingInjuryLeave.nearestActive || null,
          nearestHuman: bot.lastSafety?.nearestHuman || bot.pendingInjuryLeave.nearestHuman || null
        };
        const leaveResult = await leaveForInjury(injury);
        bot.lastDecision = {
          kind: 'wait',
          reason: 'injury-leave',
          dx: 0,
          dy: 0,
          self: currentSummary,
          injury,
          leave: leaveResult,
          holdRemainingMs: enemyReloginHoldRemainingMs()
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
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
      if (pursuitSummary && pursuitSummary.durationMs >= cfg.pursuitLeaveMs) {
        const leaveResult = await leaveForPursuit(pursuit, currentSummary);
        stopMotionSafely('pursuit-leave');
        if (leaveResult?.attempted && !leaveResult?.error) {
          bot.lastDecision = {
            kind: 'wait',
            reason: 'pursuit-leave',
            dx: 0,
            dy: 0,
            self: summarizeSelf(self),
            pursuit: pursuitSummary,
            leave: leaveResult,
            reloginDelayMs: leaveResult.reloginDelayMs,
            holdRemainingMs: enemyReloginHoldRemainingMs()
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
          leave: leaveResult,
          holdRemainingMs: enemyReloginHoldRemainingMs()
        };
        updateBotPanel(bot.lastDecision);
        if (cfg.once) bot.stop('once');
        return;
      } else if (pursuitSummary) {
        action = {
          ...action,
          pursuit: pursuitSummary
        };
      }
      const canMove = true;
      const canAttack = true;
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
		      bot.ticking = false;
		    }
		  }

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
