#!/usr/bin/env node
'use strict';

const http = require('http');

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
    else if (arg === '--debug') out.overrides.debug = true;
    else if (arg === '--debug-endpoint') out.overrides.debugEndpoint = args[++i] || '';
    else if (arg === '--debug-every-ms') out.overrides.debugEveryMs = Number(args[++i] || 0);
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
  --debug                 Enable browser bot debug event posting
  --debug-endpoint <url>  Browser debug event POST endpoint
  --debug-every-ms <ms>   Minimum interval between debug tick events. Default: 1000
  --danger-radius <cm>    Flee from active local units within this range
  --global-attack-max <cm>  Max distance for far Drop targets
  --global-coin-max <cm>  Max distance for far coins
  --tick-ms <ms>          Decision interval. Default: 120
  --low-hp <hp>           Avoid attacks below this HP. Default: 60
  --conserve-stamina <ms> Compatibility option; stamina no longer blocks non-healing actions
`);
}

function runSelfTest() {
  const cfg = {
    dangerRadius: 28000,
    activeCautionRadius: 38000,
    activeCautionExitMargin: 4000,
    activeReturnBlockMargin: 5000,
    activeReturnBlockExitMargin: 5000,
    activeReturnBlockResumeMargin: 8000,
    activeReturnBlockClearMargin: 10000,
    returnBlockScanHeadingMs: 2600,
    returnBlockScanStuckMs: 1400,
    returnBlockScanStuckDistance: 350,
    returnBlockCooldownMs: 8000,
    stationaryActiveDangerRadius: 18000,
    stationaryActiveCautionRadius: 22000,
    attackDangerRadius: 30000,
    attackRange: 14500,
    attackEngageRange: 11000,
    attackApproachRange: 26000,
    attackPreferredRange: 14500,
    globalAttackMaxDistance: 26000,
    attackMinDrop: 8,
    attackApproachMinDrop: 12,
    attackMinRewardRatio: 0.5,
    coinOpportunityValue: 60000,
    dropOpportunityValue: 100000,
    opportunityDistancePenalty: 1,
    opportunityInRangeBonus: 300000,
    opportunityNearBonus: 30000,
    opportunityStickBonus: 35000,
    coinMaxDistance: 18000,
    coinDangerRadius: 30000,
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
    patrolHeadingMs: 26000,
    patrolStaminaThreshold: 6500,
    chaseCoinStaminaThreshold: 0,
    patrolPrecisionTolerance: 1200,
    footCoinPriorityDistance: 1200,
    nearCoinPriorityDistance: 13500,
    activeReturnBlockCoinPassDistance: 900,
    conserveCoinMaxDistance: 6000,
    recoveryCoinMaxDistance: 600,
    coinPrecisionTolerance: 60,
    coinPickupStopDistance: 30,
    coinPickupMicroDistance: 120,
    coinPickupFineDistance: 320,
    coinPickupSweepDistance: 900,
    coinPickupPulseMs: 120,
    coinPickupSweepPulseMs: 80,
    coinPickupFinePulseMs: 45,
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
  const speed = e => Math.hypot(Number(e.vx) || 0, Number(e.vy) || 0);
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isMovingThreat = e => speed(e) >= 5 || Boolean(e.recentlyMoved);
  const isActive = e => isMovingThreat(e) || (e.current_join_mode === 'Active' && !hasFullStamina(e));
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
  const isRecovering = self => {
    return Number(self.hp || 0) < cfg.lowHpThreshold
      || Number(self.hp || 0) < cfg.recoverHpThreshold;
  };
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
  const attackWorthTaking = (self, target) => {
    const targetDrop = dropValue(target);
    const ownDrop = dropValue(self);
    return targetDrop >= cfg.attackMinDrop
      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
  };
  function pickField(self, coins, activeThreats) {
    const candidates = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance >= cfg.fieldMigrationMinDistance
        && c.distance <= cfg.fieldMigrationMaxDistance)
      .filter(c => !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius));
    let best = null;
    for (const coin of candidates) {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) continue;
      const totalAmount = members.reduce((sum, item) => sum + item.amount, 0);
      const score = totalAmount * 100000 - coin.distance;
      if (!best || score > best.score) best = { ...coin, score, members: members.length, totalAmount };
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
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0] || null;
  }

  function safeCoins(self, coins, activeThreats, maxDistance) {
    return coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= maxDistance)
      .filter(c => !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => a.distance - b.distance || b.amount - a.amount);
  }

  function enemyTargets(self, entities, activeThreats) {
    return entities
      .filter(e => !isActive(e) && dropValue(e) > 0 && Number(e.invulnerable_remaining_ticks || 0) <= 0)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e) }))
      .filter(e => e.distance <= cfg.attackApproachRange)
      .filter(e => attackWorthTaking(self, e))
      .filter(e => !activeThreats.some(t => dist(e, t) <= cfg.attackDangerRadius));
  }

  function scoreCoinOpportunity(coin) {
    const closeBonus = coin.distance <= cfg.coinPickupSweepDistance ? cfg.opportunityInRangeBonus : 0;
    const nearBonus = coin.distance <= cfg.nearCoinPriorityDistance ? cfg.opportunityNearBonus : 0;
    return Number(coin.amount || 0) * cfg.coinOpportunityValue
      - coin.distance * cfg.opportunityDistancePenalty
      + closeBonus
      + nearBonus;
  }

  function scoreEnemyOpportunity(target) {
    const inRange = target.distance <= cfg.attackEngageRange;
    if (!inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const nearBonus = target.distance <= cfg.nearCoinPriorityDistance ? cfg.opportunityNearBonus : 0;
    return Number(target.drop || 0) * cfg.dropOpportunityValue
      - target.distance * cfg.opportunityDistancePenalty
      + (inRange ? cfg.opportunityInRangeBonus : 0)
      + nearBonus;
  }

  function pickBestOpportunity(self, entities, coins, activeThreats) {
    const opportunities = [];
    for (const coin of safeCoins(self, coins, activeThreats, cfg.globalCoinMaxDistance)) {
      opportunities.push({
        kind: coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin',
        reason: coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin',
        id: coin.drop_id,
        amount: coin.amount,
        distance: coin.distance,
        score: scoreCoinOpportunity(coin)
      });
    }
    for (const target of enemyTargets(self, entities, activeThreats)) {
      const score = scoreEnemyOpportunity(target);
      if (score === null) continue;
      opportunities.push({
        kind: target.distance <= cfg.attackEngageRange ? 'attack' : 'seek-enemy',
        reason: target.distance <= cfg.attackEngageRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target',
        id: target.user_id,
        drop: target.drop,
        distance: target.distance,
        score
      });
    }
    return opportunities
      .sort((a, b) => b.score - a.score || a.distance - b.distance)[0] || null;
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
    return threat.cautionRadius + cfg.activeCautionExitMargin + cfg.activeReturnBlockMargin;
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

  function choose({ local = [], global = [], coins = [], self = { user_id: 1, x: 0, y: 0, hp: 100 } }) {
    const activeThreats = [...local, ...global]
      .filter(isActive)
      .map(e => decorateThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const closeThreats = activeThreats.filter(e => e.distance <= e.threatRadius);
    if (closeThreats.length) return { kind: 'flee' };
    const cautionThreats = activeThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);
    const recovery = isRecovering(self);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= nearCoinLimit
        && !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    const footCoin = coins
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0
        && c.distance <= cfg.footCoinPriorityDistance
        && !activeThreats.some(t => dist(c, t) <= t.coinDangerRadius))
      .sort((a, b) => (a.distance - b.distance) || (b.amount - a.amount))[0];
    if (recovery && nearCoin) return { kind: 'coin', id: nearCoin.drop_id, amount: nearCoin.amount };
    const nearbyHumans = [...local, ...global]
      .map(e => ({ ...e, distance: dist(self, e) }))
      .filter(e => e.distance <= (recovery ? cfg.recoveryAvoidRadius : cfg.passivePanicRadius));
    if (nearbyHumans.length) return { kind: 'flee' };
    if (recovery) return { kind: 'recover' };
    const entities = [...global, ...local];
    if (cautionThreats.length) {
      if (footCoin) return { kind: 'coin', reason: 'foot-coin-before-active-caution', id: footCoin.drop_id, amount: footCoin.amount };
      return { kind: 'flee' };
    }
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    if (footCoin) return { kind: 'coin', reason: 'foot-coin-priority', id: footCoin.drop_id, amount: footCoin.amount };
    const opportunity = pickBestOpportunity(self, entities, coins, activeThreats);
    if (opportunity) return blockThreatReturnAction(self, activeThreats, opportunity);
    if (stamina5s >= cfg.fieldMigrationStaminaThreshold) {
      const field = pickField(self, coins, activeThreats);
      if (field) {
        const dir = directionTo(self, field);
        return blockThreatReturnAction(self, activeThreats, {
          kind: 'seek-coin',
          reason: 'migrate-to-known-field',
          id: field.drop_id,
          members: field.members,
          dx: dir.dx,
          dy: dir.dy,
          target: { distance: Math.round(dir.distance) }
        });
      }
    }
    const distantCoin = pickDistantCoin(self, coins, activeThreats);
    if (distantCoin) {
      const dir = directionTo(self, distantCoin);
      return blockThreatReturnAction(self, activeThreats, {
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        id: distantCoin.drop_id,
        amount: distantCoin.amount,
        dx: dir.dx,
        dy: dir.dy,
        target: { distance: Math.round(dir.distance) }
      });
    }
    if (hasReturnBlockThreat(activeThreats)) return { kind: 'patrol', reason: 'return-block-lateral-scan' };
    if (stamina5s >= cfg.chaseCoinStaminaThreshold) return { kind: 'patrol' };
    return { kind: 'patrol' };
  }

  const cases = [
    {
      name: 'flee beats attack and coins',
      got: choose({
        local: [{ user_id: 2, x: 1000, y: 0, current_join_mode: 'Active' }],
        global: [{ user_id: 3, x: 2000, y: 0, death_reward_preview: 50 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'near coin beats drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 10, y: 0, amount: 999 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'medium safe coin beats in-range drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 3, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 3 }],
        coins: [{ drop_id: 1, x: 22000, y: 0, amount: 999 }]
      }).kind,
      want: 'seek-coin'
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
      name: 'near high drop beats one coin by opportunity score',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 17, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'profitable drop can be approached before one coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 17, x: 13000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 8000, y: 0, amount: 1 }]
      }).kind,
      want: 'seek-enemy'
    },
    {
      name: 'medium profitable drop beats one coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 17, x: 24000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }],
        coins: [{ drop_id: 1, x: 6000, y: 0, amount: 1 }]
      }).kind,
      want: 'seek-enemy'
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
      name: 'near coin beats passive bystander at full hp',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 6000, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'touching passive beats coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 80, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'safe coin beats stationary passive near but not touching',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 2, x: 1500, y: 0, current_join_mode: 'Passive' }],
        coins: [{ drop_id: 1, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'near coin beats far global drop',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 1000, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'medium safe coin beats far drop target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 22000, y: 0, amount: 5 }]
      }).kind,
      want: 'seek-coin'
    },
    {
      name: 'far coin outside local range is not chased',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 40000, y: 0, amount: 5 }]
      }).kind,
      want: 'patrol'
    },
    {
      name: 'single far coin is ignored instead of long chase',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [{ drop_id: 2, x: 50000, y: 0, amount: 1 }]
      }).kind,
      want: 'patrol'
    },
    {
      name: 'far coin cluster outside local range is ignored',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        coins: [
          { drop_id: 2, x: 50000, y: 0, amount: 1 },
          { drop_id: 3, x: 54000, y: 2000, amount: 1 },
          { drop_id: 4, x: 57000, y: -1000, amount: 1 }
        ]
      }).kind,
      want: 'patrol'
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
      name: 'low hp only picks foot coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 14 },
        global: [{ user_id: 4, x: 1000, y: 0, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: 100, y: 0, amount: 5 }]
      }).kind,
      want: 'coin'
    },
    {
      name: 'recovering avoids attacking even with drop nearby',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 70, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 7 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'active player near active-view edge triggers early flee',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'active player in caution ring triggers migration when no safe coin exists',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 36000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'moving active beyond narrowed caution does not force far flee',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 50000, y: 0, current_join_mode: 'Active', vx: -50, death_reward_preview: 7 }]
      }).kind,
      want: 'patrol'
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
      name: 'stationary non-full active inside narrowed caution keeps migrating',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 25000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 5000, death_reward_preview: 7 }],
        coins: [{ drop_id: 2, x: -18000, y: 0, amount: 1 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'stationary full-stamina active is treated as normal target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 10000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000, death_reward_preview: 20 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'stationary full-stamina active does not block safe coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 12000, y: 0, current_join_mode: 'Active', stamina_5s_remaining_milli: 10000, stamina_5s_limit_milli: 10000 }],
        coins: [{ drop_id: 2, x: 5000, y: 0, amount: 1 }]
      }).kind,
      want: 'coin'
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
      name: 'active caution blocks medium coin',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 36000, y: 0, current_join_mode: 'Active', vx: -50 }],
        coins: [{ drop_id: 2, x: -22000, y: 0, amount: 5 }]
      }).kind,
      want: 'flee'
    },
    {
      name: 'active caution blocks profitable passive target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [
          { user_id: 4, x: 36000, y: 0, current_join_mode: 'Active', vx: -50 },
          { user_id: 17, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 17 }
        ]
      }).kind,
      want: 'flee'
    },
    {
      name: 'return block prevents moving back toward nearby active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: 1, dy: 0 }
      ).kind,
      want: 'flee'
    },
    {
      name: 'return block allows moving away from nearby active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: -1, dy: 0, target: { distance: 500 } }
      ).kind,
      want: 'coin'
    },
    {
      name: 'return block scans instead of fleeing when already backing away',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active' })],
        { kind: 'coin', dx: -1, dy: 0, target: { distance: 5000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block scans instead of far fleeing when not heading toward active',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 30000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: 0, dy: -1, target: { distance: 90000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block scans inside exit radius when moving away after fresh injection',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 35000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: -1, dy: -1, target: { distance: 120000 } }
      ).kind,
      want: 'patrol'
    },
    {
      name: 'return block guards against turning back after exit radius',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 43000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: 1, dy: 0, target: { distance: 120000 } }
      ).kind,
      want: 'flee'
    },
    {
      name: 'return block allows moving farther away after exit radius',
      got: blockThreatReturnAction(
        { user_id: 1, x: 0, y: 0 },
        [decorateThreat({ x: 0, y: 0 }, { user_id: 4, x: 43000, y: 0, current_join_mode: 'Active' })],
        { kind: 'seek-coin', dx: -1, dy: 0, target: { distance: 120000 } }
      ).kind,
      want: 'seek-coin'
    },
    {
      name: 'return block uses lateral scan instead of far migration away from active',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active' }],
        coins: [
          { drop_id: 2, x: -90000, y: -1000, amount: 1 },
          { drop_id: 3, x: -94000, y: 2000, amount: 1 },
          { drop_id: 4, x: -98000, y: -2000, amount: 1 }
        ]
      }).reason,
      want: 'return-block-lateral-scan'
    },
    {
      name: 'return block avoids far migration toward active',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 4, x: 40000, y: 0, current_join_mode: 'Active' }],
        coins: [
          { drop_id: 2, x: 70000, y: -1000, amount: 1 },
          { drop_id: 3, x: 74000, y: 2000, amount: 1 },
          { drop_id: 4, x: 78000, y: -2000, amount: 1 }
        ]
      }).reason,
      want: 'return-block-lateral-scan'
    },
    {
      name: 'full hp low stamina still patrols',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 2000 },
        global: [{ user_id: 4, x: 20000, y: 0, death_reward_preview: 7 }]
      }).kind,
      want: 'patrol'
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
      name: 'attack only inside engage range',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 12000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }]
      }).kind,
      want: 'patrol'
    },
    {
      name: 'low value passive target is ignored',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 2 }]
      }).kind,
      want: 'patrol'
    },
    {
      name: 'high own drop requires worthwhile target',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000, drop: 30 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 12 }]
      }).kind,
      want: 'patrol'
    },
    {
      name: 'worthwhile close passive target can still be attacked',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000, drop: 30 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 16 }]
      }).kind,
      want: 'attack'
    },
    {
      name: 'near passive drop can be opportunistic attack',
      got: choose({
        self: { user_id: 1, x: 0, y: 0, hp: 100, stamina_5s_remaining_milli: 10000 },
        local: [{ user_id: 7, x: 10000, y: 0, current_join_mode: 'Passive', death_reward_preview: 9 }]
      }).kind,
      want: 'attack'
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
		  const previousBot = window[BOT_KEY] || null;
  const preserved = {
    attackHistory: Array.isArray(previousBot?.attackHistory) ? previousBot.attackHistory.slice(-80) : [],
    killHistory: Array.isArray(previousBot?.killHistory) ? previousBot.killHistory.slice(-40) : [],
    seenKillKeys: Array.isArray(previousBot?.seenKillKeysList) ? previousBot.seenKillKeysList.slice(-120) : [],
    coinFailures: previousBot?.coinFailures instanceof Map ? Array.from(previousBot.coinFailures.entries()).slice(-120) : []
  };
	  const cfg = {
	    dryRun: Boolean(config.dryRun),
	    once: Boolean(config.once),
	    version: String(config.version || 'dev'),
	    sourceHash: String(config.sourceHash || ''),
	    sourceUrl: String(config.sourceUrl || ''),
	    injectedBy: String(config.injectedBy || 'cdp'),
	    debug: Boolean(config.debug),
	    debugEndpoint: String(config.debugEndpoint || ''),
    debugEveryMs: Math.max(250, Number(config.debugEveryMs) || 1000),
    tickMs: 120,
    statusEvery: Math.max(250, Number(config.statusEvery) || 1000),
    dangerRadius: 28000,
    activeCautionRadius: 38000,
    activeCautionExitMargin: 4000,
    activeReturnBlockMargin: 5000,
    activeReturnBlockExitMargin: 5000,
    activeReturnBlockResumeMargin: 8000,
    activeReturnBlockClearMargin: 10000,
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
    attackDangerRadius: 30000,
    globalAttackMaxDistance: 26000,
    attackMinDrop: 8,
    attackApproachMinDrop: 12,
    attackMinRewardRatio: 0.5,
    coinOpportunityValue: 60000,
    dropOpportunityValue: 100000,
    opportunityDistancePenalty: 1,
    opportunityInRangeBonus: 300000,
    opportunityNearBonus: 30000,
    opportunityStickBonus: 35000,
    coinMaxDistance: 18000,
    coinDangerRadius: 30000,
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
    patrolHeadingMs: 26000,
    patrolStaminaThreshold: 6500,
    chaseCoinStaminaThreshold: 0,
    patrolPrecisionTolerance: 1200,
    footCoinPriorityDistance: 1200,
    nearCoinPriorityDistance: 13500,
    activeReturnBlockCoinPassDistance: 900,
    conserveCoinMaxDistance: 6000,
    recoveryCoinMaxDistance: 600,
    coinPrecisionTolerance: 60,
    targetStickMs: 5000,
    coinStickMs: 2500,
    coinNoProgressMs: 18000,
    coinProgressMinGain: 250,
    coinIgnoreMs: 20000,
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
    coinPickupStopDistance: 30,
    coinPickupMicroDistance: 120,
    coinPickupFineDistance: 320,
    coinPickupSweepDistance: 900,
    coinPickupPulseMs: 120,
    coinPickupSweepPulseMs: 80,
    coinPickupFinePulseMs: 45,
    shootEveryMs: 120,
    globalRefreshMs: 5000,
    nativeTickMinMs: 120,
    attackMinStamina: 0,
    conserveStaminaThreshold: 6500,
    lowHpThreshold: 60,
    recoverHpThreshold: 95,
    staminaFullRatio: 0.98,
    autoLogin: true,
    loginCooldownMs: 5000,
    postLoginGraceMs: 45000,
    fleeLockMs: 1400,
    offlineLeaveMs: 3000,
    offlineLeaveCooldownMs: 60000,
    reloadAfterNoSelfMs: 45000,
    reloadAfterOfflineMs: 20000,
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
    reloadRequestedAt: 0,
    lastTarget: null,
    lastTargetAt: 0,
    lastSelf: null,
    lastSafety: null,
    actionThreats: [],
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
	    globalState: { refreshedAt: 0, tick: 0, entities: [], coinDrops: [], messages: [], minimap: null, error: '' },
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
	      lastVelocityAt: 0
	    },
    attackHistory: preserved.attackHistory,
    killHistory: preserved.killHistory,
    seenKillKeys: new Set(preserved.seenKillKeys),
    seenKillKeysList: preserved.seenKillKeys,
	    tickCount: 0,
	    ticking: false,
	    lastDecision: null,
	    errors: [],
	    lastDebugAt: 0,
	    stopReason: '',
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
    step(source = 'external') {
      return tick(source);
    },
    status() {
      if (this.running && !this.ticking && this.lastTickAt && Date.now() - this.lastTickAt > Math.max(3000, cfg.tickMs * 10)) {
        triggerNativeTick('status-watchdog', false);
      }
      const self = getSelf();
      if (self) updateKillHistory(self);
	      return {
	        version: cfg.version,
	        sourceHash: cfg.sourceHash,
	        sourceUrl: cfg.sourceUrl,
	        injectedBy: cfg.injectedBy,
	        running: this.running,
        ticking: Boolean(this.ticking),
        timerActive: Boolean(this.timer),
        dryRun: cfg.dryRun,
        tickCount: this.tickCount,
        uptimeMs: Date.now() - this.startedAt,
        lastTickAt: this.lastTickAt,
        lastTickAgeMs: this.lastTickAt ? Date.now() - this.lastTickAt : null,
        lastNativeTickAgeMs: this.lastNativeTickAt ? now() - this.lastNativeTickAt : null,
        lastAction: this.lastAction,
        lastDecision: this.lastDecision,
        lastTarget: this.lastTarget,
        self: self ? summarizeSelf(self) : this.lastSelf,
        safety: this.lastSafety,
        attackHistory: this.attackHistory.slice(-10),
        killHistory: this.killHistory.slice(-10),
        coinProgress: this.coinProgress,
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
	          tick: this.globalState.tick,
	          entities: this.globalState.entities.length,
	          coinDrops: this.globalState.coinDrops.length,
	          minimapPoints: this.globalState.minimap?.points?.length || 0,
	          error: this.globalState.error
	        },
        control: summarizeControl(),
        login: {
          lastAt: this.lastLoginAt || 0,
          lastAgeMs: this.lastLoginAt ? Date.now() - this.lastLoginAt : null,
          lastResult: this.lastLoginResult
        },
        offlineLeave: {
          lastAt: this.lastOfflineLeaveAt || 0,
          lastAgeMs: this.lastOfflineLeaveAt ? Date.now() - this.lastOfflineLeaveAt : null,
          lastResult: this.lastOfflineLeaveResult
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
  const hasMoveStamina = e => Number(e?.stamina_5s_remaining_milli || 0) > 250;
  const hasAttackStamina = e => Number(e?.stamina_5s_remaining_milli || 0) >= cfg.attackMinStamina;
  const staminaLimit = e => Number(e?.stamina_5s_limit_milli || 10000);
  const hasFullStamina = e => {
    const limit = staminaLimit(e);
    const stamina = Number(e?.stamina_5s_remaining_milli ?? NaN);
    return Number.isFinite(stamina) && limit > 0 && stamina >= limit * cfg.staminaFullRatio;
  };
  const isMovingThreat = e => speed(e) >= cfg.activeSpeedMin || Boolean(e.recentlyMoved);
  const isCurrentlyActive = e => isMovingThreat(e) || (e.current_join_mode === 'Active' && !hasFullStamina(e));
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
    const hp = Number(self?.hp || 0);
    return hp < cfg.lowHpThreshold
      || hp < cfg.recoverHpThreshold;
  };
  const isConservingStamina = self => {
    const stamina = Number(self?.stamina_5s_remaining_milli ?? cfg.conserveStaminaThreshold);
    return stamina < cfg.conserveStaminaThreshold;
  };
	  const attackWorthTaking = (self, target) => {
	    const targetDrop = dropValue(target);
	    const ownDrop = dropValue(self);
	    return targetDrop >= cfg.attackMinDrop
	      && (!ownDrop || targetDrop >= ownDrop * cfg.attackMinRewardRatio);
	  };

	  function ensureBotPanel() {
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

	  function actionText(decision) {
	    const kind = decision?.kind || 'wait';
	    const target = decision?.target || null;
	    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
	    if (kind === 'coin') return '拾取金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
	    if (kind === 'seek-coin') return '前往金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
	    if (kind === 'attack') return '攻击 ' + (target?.name || ('#' + (target?.id ?? '-'))) + ' Drop ' + (target?.drop ?? '-');
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
	      'best-opportunity-coin': '综合收益最高：拾取金币',
	      'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
	      'best-opportunity-drop-target': '综合收益最高：攻击 Drop 目标',
	      'approach-profitable-drop-target': '综合收益最高：靠近高 Drop 目标',
	      'migrate-to-known-field': '迁移到金币密集区域',
	      'scan-toward-distant-coin': '扫描远处金币',
	      'scan-open-area': '开阔区域巡航',
	      'ignore-stale-coin-no-progress': '金币长时间无进展，临时脱离',
	      'leave-stale-coin': '离开疑似卡住金币',
	      'wait-for-full-stamina-and-hp': '等待恢复到安全状态',
	      'conserve-stamina-before-chasing': '兼容旧状态：保存体力',
	      'save-stamina-for-profitable-coin': '兼容旧状态：等待目标',
	      'control-ws-offline': 'WebSocket 离线',
	      'offline-leave': 'WebSocket 离线，正在退出',
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
	    const panel = ensureBotPanel();
	    if (!panel) return;
	    const self = decision?.self || bot.lastSelf || null;
	    const hp = self?.hp ?? '-';
	    const stamina5s = self?.stamina5s ?? self?.stamina_5s_remaining_milli ?? '-';
	    const selfDrop = self ? (self.drop ?? dropValue(self)) : '-';
	    const control = summarizeControl();
	    const safety = bot.lastSafety || {};
	    const nearestActive = safety.nearestActive
	      ? (safety.nearestActive.name || ('#' + safety.nearestActive.id)) + ' ' + formatDistance(safety.nearestActive.distance)
	      : '-';
	    const wsLabel = control.wsOpen ? 'online' : (control.connecting ? 'connecting' : 'offline');
	    const velocity = control.nativeCurrentVel || control.lastVelocity || '0 0';
	    const panelLines = [
	      '<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#f8fafc">BOT ' + escapeHtml(actionText(decision)) + '</div>',
	      '<div>原因：' + escapeHtml(reasonText(decision?.reason)) + '</div>',
	      '<div>HP ' + escapeHtml(hp) + ' / 体力 ' + escapeHtml(stamina5s) + ' / Drop ' + escapeHtml(selfDrop || '-') + '</div>',
	      '<div>移动 ' + escapeHtml(decision?.dx ?? 0) + ',' + escapeHtml(decision?.dy ?? 0) + ' / 速度 ' + escapeHtml(velocity) + '</div>',
	      '<div>WS ' + escapeHtml(wsLabel) + ' / 最近 Active ' + escapeHtml(nearestActive) + '</div>'
	    ];
	    if (decision?.target) {
	      const target = decision.target;
	      panelLines.push('<div>目标：' + escapeHtml(target.name || ('#' + (target.id ?? '-'))) + ' 距离 ' + escapeHtml(formatDistance(target.distance)) + ' 金币 ' + escapeHtml(target.amount ?? '-') + ' Drop ' + escapeHtml(target.drop ?? '-') + '</div>');
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

		  function postDebugEvent(type, detail = {}, options = {}) {
		    if (!cfg.debug || !cfg.debugEndpoint) return;
		    const t = Date.now();
		    if (!options.force && t - Number(bot.lastDebugAt || 0) < cfg.debugEveryMs) return;
		    bot.lastDebugAt = t;
		    let status = null;
		    try {
		      status = bot.status ? bot.status() : null;
		    } catch (err) {
		      status = { error: err?.message || String(err) };
		    }
		    const payload = {
		      at: new Date(t).toISOString(),
		      type,
		      version: cfg.version,
		      sourceHash: cfg.sourceHash,
		      sourceUrl: cfg.sourceUrl,
		      injectedBy: cfg.injectedBy,
		      url: location.href,
		      title: document.title,
		      detail,
		      status
		    };
		    try {
		      if (typeof window.__graspRatBotDebugPost === 'function') {
		        window.__graspRatBotDebugPost(payload);
		        return;
		      }
		    } catch (_) {}
		    try {
		      fetch(cfg.debugEndpoint, {
		        method: 'POST',
		        mode: 'no-cors',
		        keepalive: true,
		        headers: { 'Content-Type': 'text/plain' },
		        body: JSON.stringify(payload)
		      }).catch(() => {});
		    } catch (_) {}
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
    const until = Date.now() + Math.max(1000, Number(ms) || cfg.postLoginGraceMs);
    try {
      localStorage.setItem('graspRatLoginSuppressUntil', String(until));
      localStorage.setItem('graspRatLoginSuppressReason', String(reason || 'login flow'));
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

  async function maybeStartAutoLogin(reason) {
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
    const needsLogin = Boolean(loginControl) || !hasToken || hasLoginRequiredText();
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

  async function leaveOffline(reason) {
    const t = Date.now();
    if (cfg.dryRun || cfg.once) return null;
    if (t - Number(bot.lastOfflineLeaveAt || 0) < cfg.offlineLeaveCooldownMs) {
      return {
        attempted: false,
        reason: 'cooldown',
        cooldownRemainingMs: Math.max(0, Math.round(cfg.offlineLeaveCooldownMs - (t - Number(bot.lastOfflineLeaveAt || 0))))
      };
    }
    const detail = {
      attempted: false,
      method: '',
      reason,
      userId: getCurrentUserId() || null,
      error: ''
    };
    bot.lastOfflineLeaveAt = t;
    try {
      if (typeof leave === 'function') {
        const result = detail.userId ? leave(detail.userId) : leave();
        if (result && typeof result.then === 'function') await result;
        detail.attempted = true;
        detail.method = detail.userId ? 'leave(userId)' : 'leave';
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
    if (detail.attempted && !detail.error) setLoginSuppress('offline leave', cfg.offlineLeaveCooldownMs);
    bot.lastOfflineLeaveResult = detail;
    postDebugEvent(detail.error ? 'leave-error' : 'leave-offline', detail, { force: true });
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
	    Promise.resolve(tick(source)).catch(err => {
	      bot.errors.push({ at: Date.now(), message: err.message || String(err), stack: String(err.stack || '') });
	      if (bot.errors.length > 20) bot.errors.shift();
	    });
	  }

	  function ensureNativeMessagePump(native = getNativeControl()) {
	    if (!native?.ws) return false;
	    if (bot.nativeMessageWs === native.ws && bot.nativeMessageHandler) return true;
	    detachNativeMessagePump();
	    bot.nativeMessageWs = native.ws;
	    bot.nativeMessageHandler = () => {
	      triggerNativeTick('native-ws', true);
	    };
	    bot.nativeOpenHandler = () => {
	      bot.control.lastOpenAt = Date.now();
	      bot.control.lastError = '';
	      triggerNativeTick('native-ws-open', false);
	    };
	    bot.nativeCloseHandler = () => {
	      bot.control.wsOpen = false;
	      bot.control.nativeWsOpen = false;
	      bot.control.wsReadyState = native.ws.readyState;
	      bot.control.nativeWsReadyState = native.ws.readyState;
	    };
	    bot.nativeErrorHandler = () => {
	      bot.control.lastError = 'native websocket error';
	    };
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
	    const nativeCurrentVel = nativeState?.currentVel
	      ? (Number(nativeState.currentVel.dx || 0) + ' ' + Number(nativeState.currentVel.dy || 0))
	      : '';
	    const nativeKeys = nativeState?.keys && typeof nativeState.keys[Symbol.iterator] === 'function'
	      ? Array.from(nativeState.keys)
	      : [];
	    return {
	      currentUserId: control.currentUserId || getCurrentUserId(),
	      hasToken: Boolean(getSessionToken()),
	      wsOpen: Boolean(control.wsOpen),
	      wsReadyState: native ? native.wsReadyState : (control.ws ? control.ws.readyState : control.wsReadyState),
	      connecting: Boolean(control.connecting),
	      transport: control.transport || (native ? 'native-page' : 'none'),
	      allowNativeReconnect: false,
	      allowBotWebSocketFallback: false,
	      nativeWsOpen: Boolean(native?.wsOpen),
	      nativeWsReadyState: native ? native.wsReadyState : null,
	      lastOpenAgeMs: control.lastOpenAt ? Date.now() - control.lastOpenAt : null,
	      lastMessageAgeMs: control.lastMessageAt ? Date.now() - control.lastMessageAt : null,
	      lastError: control.lastError || '',
	      lastVelocity: control.lastVelocity || '',
	      nativeCurrentVel,
	      nativeLastVel: nativeState?.lastVel || '',
	      nativeKeys
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
	    const nativeEntity = (nativeState?.entities || []).find(e => Number(e.user_id) === id);
	    if (nativeEntity) return nativeEntity;
	    return (bot.globalState.entities || []).find(e => Number(e.user_id) === id) || null;
	  }
	
	  function getEntities() {
	    const nativeState = getNativeState();
	    if (Array.isArray(nativeState?.entities) && nativeState.entities.length) return nativeState.entities;
	    return bot.globalState.entities || [];
	  }
	
	  function getCoins() {
	    const nativeState = getNativeState();
	    if (Array.isArray(nativeState?.coinDrops)) return nativeState.coinDrops;
	    return bot.globalState.coinDrops || [];
	  }

  function summarizeSelf(self) {
    return {
      id: self.user_id,
      name: self.name,
      x: Math.round(Number(self.x) || 0),
      y: Math.round(Number(self.y) || 0),
      hp: self.hp,
      stamina5s: self.stamina_5s_remaining_milli,
      stamina1h: self.stamina_1h_remaining_milli,
      drop: dropValue(self),
      coins: Number(self.coins || 0),
      life: self.life,
      mode: self.current_join_mode
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
        fetch('/snapshot', { cache: 'no-store' }),
        fetch('/minimap', { cache: 'no-store' })
      ]);
	      const [snapshot, minimap] = await Promise.all([snapshotRes.json(), minimapRes.json()]);
	      bot.globalState.tick = Number(snapshot?.tick || bot.globalState.tick || 0);
	      bot.globalState.entities = snapshot?.entities || [];
	      bot.globalState.coinDrops = snapshot?.coin_drops || [];
	      bot.globalState.messages = snapshot?.messages || [];
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
	      bot.velocityStopTimer = setTimeout(() => {
	        if (bot.velocityPulseToken !== token) return;
	        bot.velocityStopTimer = 0;
	        stopMotionSafely('precision-pulse');
	      }, clamp(Math.round(pulseMs), 20, 110));
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

  function shootAt(self, target, force = false) {
    if (!target) return false;
    const t = now();
    if (!force && t - bot.lastShotAt < cfg.shootEveryMs) return false;
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
    return threat.cautionRadius + cfg.activeCautionExitMargin + cfg.activeReturnBlockMargin;
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
      if (recent && (recent.distance <= returnBlockSuppressRadius(recent) || t < Number(bot.returnBlockCooldownUntil || 0))) {
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
    const localEntities = getEntities()
      .filter(e => Number(e.user_id) !== Number(self.user_id) && isAlive(e));
    markRecentMovement(localEntities);
    const globalById = new Map(
      (bot.globalState.entities || [])
        .filter(e => Number(e.user_id) !== Number(self.user_id) && isAlive(e))
        .map(e => [Number(e.user_id), e])
    );
    for (const entity of localEntities) {
      globalById.set(Number(entity.user_id), { ...(globalById.get(Number(entity.user_id)) || {}), ...entity });
    }
    const entities = Array.from(globalById.values());
    const activeThreats = entities
      .filter(e => isCurrentlyActive(e))
      .map(e => decorateActiveThreat(self, e))
      .sort((a, b) => a.distance - b.distance);
    const inactiveTargets = entities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && Number(e.invulnerable_remaining_ticks || 0) <= 0)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .filter(e => e.distance <= cfg.attackRange)
      .sort((a, b) => {
        const stickyA = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(a.user_id);
        const stickyB = bot.lastTarget && String(bot.lastTarget.kind) === 'enemy' && String(bot.lastTarget.id) === String(b.user_id);
        if (stickyA !== stickyB && now() - bot.lastTargetAt < cfg.targetStickMs) return stickyA ? -1 : 1;
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const coins = getCoins()
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0) }))
      .filter(c => c.amount > 0 && c.distance <= cfg.coinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const allCoins = getCoins()
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: false }))
      .filter(c => c.amount > 0)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const globalTargets = entities
      .filter(e => !isCurrentlyActive(e) && dropValue(e) > 0 && Number(e.invulnerable_remaining_ticks || 0) <= 0)
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e), global: true }))
      .filter(e => e.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const minimapDropTargets = (bot.globalState.minimap?.points || [])
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
      .filter(p => p.drop > 0 && p.distance <= cfg.globalAttackMaxDistance)
      .sort((a, b) => {
        if (b.drop !== a.drop) return b.drop - a.drop;
        return a.distance - b.distance;
      });
    const globalCoins = getCoins()
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: false }))
      .filter(c => c.amount > 0 && c.distance <= cfg.globalCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const patrolCoins = getCoins()
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: false }))
      .filter(c => c.amount > 0 && c.distance <= cfg.patrolCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const scanCoins = getCoins()
      .map(c => ({ ...c, distance: dist(self, c), amount: Number(c.amount || 0), global: false }))
      .filter(c => c.amount > 0 && c.distance <= cfg.scanCoinMaxDistance)
      .sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return b.amount - a.amount;
      });
    const nearbyHumans = entities
      .map(e => ({ ...e, distance: dist(self, e), drop: dropValue(e), speed: speed(e) }))
      .sort((a, b) => a.distance - b.distance);
    return { entities, activeThreats, inactiveTargets, coins, allCoins, globalTargets, minimapDropTargets, globalCoins, patrolCoins, scanCoins, nearbyHumans };
  }

  function safeCoinCandidates(coins, activeThreats, maxDistance) {
    const t = now();
    for (const [id, until] of bot.ignoredCoins.entries()) {
      if (until <= t) bot.ignoredCoins.delete(id);
    }
    return coins.filter(c => c.distance <= maxDistance
      && !bot.ignoredCoins.has(String(c.drop_id))
      && !activeThreats.some(t => dist(c, t) <= (t.coinDangerRadius ?? cfg.coinDangerRadius)));
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

  function pickCoinField(allCoins, activeThreats) {
    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.fieldMigrationMaxDistance)
      .filter(c => c.distance >= cfg.fieldMigrationMinDistance);
    if (!candidates.length) return null;
    let best = null;
    for (const coin of candidates.slice(0, 80)) {
      const members = candidates.filter(other => dist(coin, other) <= cfg.fieldMigrationClusterRadius);
      if (members.length < cfg.fieldMigrationMinCoins) continue;
      const totalAmount = members.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const score = totalAmount * 100000 - coin.distance;
      const item = {
        ...coin,
        fieldMembers: members.length,
        fieldAmount: totalAmount,
        fieldScore: score
      };
      if (!best || item.fieldScore > best.fieldScore) best = item;
    }
    return best;
  }

  function pickDistantCoin(allCoins, activeThreats) {
    const candidates = safeCoinCandidates(allCoins, activeThreats, cfg.distantCoinMaxDistance)
      .filter(c => c.distance >= cfg.distantCoinMinDistance);
    if (!candidates.length) return null;
    return candidates[0];
  }

  function scoreCoinOpportunity(coin) {
    const sticky = bot.lastTarget?.kind === 'coin'
      && String(bot.lastTarget.id) === String(coin.drop_id)
      && now() - bot.lastTargetAt < cfg.coinStickMs;
    const closeBonus = coin.distance <= cfg.coinPickupSweepDistance ? cfg.opportunityInRangeBonus : 0;
    const nearBonus = coin.distance <= cfg.nearCoinPriorityDistance ? cfg.opportunityNearBonus : 0;
    return Number(coin.amount || 0) * cfg.coinOpportunityValue
      - Number(coin.distance || 0) * cfg.opportunityDistancePenalty
      + closeBonus
      + nearBonus
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function scoreEnemyOpportunity(target) {
    const inRange = Number(target.distance || Infinity) <= cfg.attackEngageRange;
    if (!inRange && Number(target.drop || 0) < cfg.attackApproachMinDrop) return null;
    const sticky = bot.lastTarget?.kind === 'enemy'
      && String(bot.lastTarget.id) === String(target.user_id)
      && now() - bot.lastTargetAt < cfg.targetStickMs;
    const nearBonus = target.distance <= cfg.nearCoinPriorityDistance ? cfg.opportunityNearBonus : 0;
    return Number(target.drop || 0) * cfg.dropOpportunityValue
      - Number(target.distance || 0) * cfg.opportunityDistancePenalty
      + (inRange ? cfg.opportunityInRangeBonus : 0)
      + nearBonus
      + (sticky ? cfg.opportunityStickBonus : 0);
  }

  function enemyOpportunityCandidates(self, targets, activeThreats) {
    const byId = new Map();
    for (const raw of targets) {
      const id = raw?.user_id;
      if (!id && id !== 0) continue;
      const drop = Number(raw.drop ?? dropValue(raw) ?? 0);
      const distance = Number(raw.distance ?? Infinity);
      if (!drop || !Number.isFinite(distance) || distance > cfg.attackApproachRange) continue;
      if (Number(raw.invulnerable_remaining_ticks || 0) > 0) continue;
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
    return {
      kind: kind || (coin.distance <= cfg.coinMaxDistance ? 'coin' : 'seek-coin'),
      reason,
      target: { id: coin.drop_id, x: coin.x, y: coin.y, amount: coin.amount, distance: Math.round(dir.distance) },
      dx: dir.dx,
      dy: dir.dy,
      ...coinMotionMeta(dir),
      score: Math.round(scoreCoinOpportunity(coin))
    };
  }

  function buildEnemyAction(self, target, reason = '') {
    const dir = directionTo(self, target);
    const inRange = Number(dir.distance || Infinity) <= cfg.attackEngageRange;
    return {
      kind: inRange ? 'attack' : 'seek-enemy',
      reason: reason || (inRange ? 'best-opportunity-drop-target' : 'approach-profitable-drop-target'),
      target: {
        id: target.user_id,
        name: target.name,
        x: target.x,
        y: target.y,
        drop: target.drop,
        distance: Math.round(dir.distance),
        hp: target.hp
      },
      dx: inRange ? 0 : dir.dx,
      dy: inRange ? 0 : dir.dy,
      shoot: inRange,
      score: Math.round(scoreEnemyOpportunity(target) || 0)
    };
  }

  function pickBestOpportunity(self, activeThreats, coinGroups, enemyGroups) {
    const opportunities = [];
    const coinById = new Map();
    for (const { coins: groupCoins, maxDistance } of coinGroups) {
      for (const coin of safeCoinCandidates(groupCoins, activeThreats, maxDistance)) {
        const id = String(coin.drop_id);
        const previous = coinById.get(id);
        if (!previous || coin.distance < previous.distance || Number(coin.amount || 0) > Number(previous.amount || 0)) {
          coinById.set(id, coin);
        }
      }
    }
    for (const coin of coinById.values()) {
      opportunities.push({
        type: 'coin',
        distance: coin.distance,
        score: scoreCoinOpportunity(coin),
        action: () => buildCoinAction(
          self,
          coin,
          coin.distance <= cfg.coinMaxDistance ? 'best-opportunity-coin' : 'best-opportunity-visible-coin'
        )
      });
    }

    const enemyTargets = enemyOpportunityCandidates(self, enemyGroups.flat(), activeThreats);
    for (const target of enemyTargets) {
      const score = scoreEnemyOpportunity(target);
      if (score === null) continue;
      opportunities.push({
        type: 'enemy',
        distance: target.distance,
        score,
        action: () => buildEnemyAction(self, target)
      });
    }

    const best = opportunities.sort((a, b) => b.score - a.score || a.distance - b.distance)[0] || null;
    return best ? best.action() : null;
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
      if (d > cfg.activeCautionRadius * 1.4) continue;
      const weight = (cfg.activeCautionRadius * 1.4 - d + 1000) / d;
      vx += (Number(self.x) - Number(threat.x)) * weight / d;
      vy += (Number(self.y) - Number(threat.y)) * weight / d;
    }
    let dx = Math.abs(vx) > 0.01 ? Math.sign(vx) : 0;
    let dy = Math.abs(vy) > 0.01 ? Math.sign(vy) : 0;
    if (!(dx || dy)) {
      const t = now();
      if (bot.patrolHeading && t < Number(bot.patrolHeading.until || 0) && (bot.patrolHeading.dx || bot.patrolHeading.dy)) {
        return { dx: bot.patrolHeading.dx, dy: bot.patrolHeading.dy, distance: 0, reason: 'scan-open-area' };
      }
      const bucketX = Math.floor(Number(self.x || 0) / 24000);
      const bucketY = Math.floor(Number(self.y || 0) / 24000);
      const phase = Math.abs(bucketX * 31 + bucketY * 17 + Math.floor(t / cfg.patrolHeadingMs)) % 8;
      const pattern = [
        { dx: 1, dy: 0 },
        { dx: 1, dy: 1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: -1, dy: -1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: -1 }
      ][phase];
      dx = pattern.dx;
      dy = pattern.dy;
      bot.patrolHeading = { dx, dy, until: t + cfg.patrolHeadingMs };
    } else {
      bot.patrolHeading = null;
    }
    return { dx, dy, distance: 0, reason: 'scan-open-area' };
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
    const attempt = bot.coinAttempts.get(id) || {
      id,
      startedAt: t,
      lastImprovedAt: t,
      bestDistance: distance,
      lastDistance: distance,
      closeStartedAt: distance <= cfg.closeCoinStuckDistance ? t : 0,
      nearStartedAt: distance <= cfg.nearCoinStuckDistance ? t : 0
    };
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
        lastDistance: distance
      };
      return action;
    }
    const improved = distance + cfg.coinProgressMinGain < Number(previous.bestDistance);
    if (improved) {
      bot.coinProgress = {
        ...previous,
        lastImprovedAt: t,
        bestDistance: distance,
        lastDistance: distance
      };
      return action;
    }
    bot.coinProgress = {
      ...previous,
      lastDistance: distance
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
      bot.lastTargetAt = now();
    }
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

  function chooseAction(self) {
    const { activeThreats, inactiveTargets, coins, allCoins, globalTargets, minimapDropTargets, globalCoins, patrolCoins, scanCoins, nearbyHumans } = classify(self);
    bot.actionThreats = activeThreats;
    bot.lastSafety = {
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
      recovery: isRecovering(self),
      conservingStamina: isConservingStamina(self)
    };
    const closeThreats = activeThreats.filter(e => e.distance <= e.threatRadius);
    if (closeThreats.length) {
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
    const cautionThreats = activeThreats.filter(e => e.distance <= e.cautionRadius + cfg.activeCautionExitMargin);

    const recovery = isRecovering(self);
    const stamina5s = Number(self.stamina_5s_remaining_milli || 0);
    const nearCoinLimit = recovery
      ? cfg.recoveryCoinMaxDistance
      : cfg.nearCoinPriorityDistance;
    const nearCoin = pickCoin(coins, activeThreats, nearCoinLimit);
    const footCoin = pickCoin(coins, activeThreats, cfg.footCoinPriorityDistance);
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

    const avoidHumans = nearbyHumans.filter(e => e.distance <= (recovery ? cfg.recoveryAvoidRadius : cfg.passivePanicRadius));
    if (avoidHumans.length) {
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

    if (cautionThreats.length) {
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
      return {
        kind: 'coin',
        reason: 'foot-coin-priority',
        target: { id: footCoin.drop_id, x: footCoin.x, y: footCoin.y, amount: footCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      };
    }

    const opportunity = pickBestOpportunity(
      self,
      activeThreats,
      [
        { coins, maxDistance: cfg.coinMaxDistance },
        { coins: globalCoins, maxDistance: cfg.globalCoinMaxDistance },
        { coins: patrolCoins, maxDistance: cfg.patrolCoinMaxDistance }
      ],
      [inactiveTargets, globalTargets, minimapDropTargets]
    );
    if (opportunity) {
      bot.fleeLock = null;
      return opportunity;
    }

    const fieldTarget = stamina5s >= cfg.fieldMigrationStaminaThreshold
      ? pickCoinField(allCoins, activeThreats)
      : null;
    if (fieldTarget) {
      bot.fleeLock = null;
      const dir = coinDirectionTo(self, fieldTarget);
      return {
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
      };
    }

    const distantCoin = pickDistantCoin(allCoins, activeThreats);
    if (distantCoin) {
      bot.fleeLock = null;
      const dir = coinDirectionTo(self, distantCoin);
      return {
        kind: 'seek-coin',
        reason: 'safe-distant-coin',
        target: { id: distantCoin.drop_id, x: distantCoin.x, y: distantCoin.y, amount: distantCoin.amount, distance: Math.round(dir.distance) },
        dx: dir.dx,
        dy: dir.dy,
        ...coinMotionMeta(dir)
      };
    }

    if (hasReturnBlockThreat(activeThreats)) {
      bot.fleeLock = null;
      return buildReturnBlockScanAction(self, activeThreats, nearbyHumans);
    }

    const canPatrol = stamina5s >= cfg.chaseCoinStaminaThreshold;
    if (canPatrol) {
      bot.fleeLock = null;
      const scanCoin = safeCoinCandidates(scanCoins, activeThreats, cfg.scanCoinMaxDistance)[0] || null;
      const dir = patrolDirection(self, activeThreats, nearbyHumans, scanCoin);
      return {
        kind: 'patrol',
        reason: dir.reason,
        target: scanCoin ? { id: scanCoin.drop_id, x: scanCoin.x, y: scanCoin.y, amount: scanCoin.amount, distance: Math.round(dir.distance) } : null,
        dx: dir.dx,
        dy: dir.dy
      };
    }

    const dir = patrolDirection(self, activeThreats, nearbyHumans, null);
    return { kind: 'patrol', reason: dir.reason, dx: dir.dx, dy: dir.dy };
  }

  async function tick(source = 'timer') {
    if (!bot.running) return;
    if (bot.ticking) return bot.status();
    bot.ticking = true;
    try {
      bot.tickCount += 1;
      bot.lastTickAt = Date.now();
	      const self = getSelf();
	      if (!self || !isAlive(self)) {
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
	          visibleEntities: bot.globalState.entities.length,
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
	      bot.waitSince = 0;
	      const previousDrop = Number(bot.lastSelf?.drop ?? 0);
	      const currentSummary = summarizeSelf(self);
	      if (Number(currentSummary.drop || 0) > previousDrop) {
	        clearCoinTracking('drop-increased');
	      }
	      bot.lastSelf = currentSummary;
	      updateKillHistory(self);
	      ensureControlWs();
	      if (!cfg.dryRun && !bot.control.wsOpen) {
	        stopMotionSafely('control-ws-offline');
	        if (!bot.offlineSince) bot.offlineSince = Date.now();
	        const offlineAgeMs = Date.now() - bot.offlineSince;
	        const leaveResult = offlineAgeMs >= cfg.offlineLeaveMs
	          ? await leaveOffline('websocket offline')
	          : null;
	        bot.lastDecision = {
	          kind: 'wait',
	          reason: leaveResult?.attempted && !leaveResult?.error ? 'offline-leave' : 'control-ws-offline',
	          control: summarizeControl(),
	          self: summarizeSelf(self),
	          offlineAgeMs,
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
      refreshGlobalState(false).catch(err => {
        bot.globalState.error = err.message || String(err);
      });

      let action = chooseAction(self);
      action = blockThreatReturnAction(self, bot.actionThreats || [], action);
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
      const canMove = true;
      const canAttack = true;
      sendActionVelocity(action);
      if (action.kind === 'attack' && action.shoot && action.target) {
        shootAt(self, action.target);
        setLastTarget('enemy', action.target.id);
        rememberAttack(self, action.target, action.kind);
      } else if ((action.kind === 'coin' || action.kind === 'seek-coin') && action.target) {
        setLastTarget('coin', action.target.id);
      } else if ((action.kind === 'seek-enemy' || action.kind === 'seek-drop') && action.target) {
        setLastTarget('enemy', action.target.id);
        rememberAttack(self, action.target, action.kind);
      } else if (action.kind === 'flee') {
        bot.lastTarget = null;
        bot.lastTargetAt = 0;
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
        console.log('[grasp-rat-bot:status]', JSON.stringify(bot.lastDecision));
      }

      if (cfg.once) bot.stop('once');
	    } catch (err) {
	      bot.errors.push({ at: Date.now(), message: err.message, stack: String(err.stack || '') });
      if (bot.errors.length > 20) bot.errors.shift();
      stopMotionSafely('bot-error');
      bot.lastDecision = {
        kind: 'wait',
        reason: 'bot-error',
        dx: 0,
        dy: 0,
        self: bot.lastSelf,
        error: err.message || String(err)
      };
	      updateBotPanel(bot.lastDecision);
	      console.error('[grasp-rat-bot:error]', err);
	      postDebugEvent('error', { source, message: err.message || String(err), stack: String(err.stack || '') }, { force: true });
	    } finally {
	      if (bot.lastDecision) postDebugEvent('tick', { source, decision: bot.lastDecision });
	      bot.ticking = false;
	    }
	  }

	  return refreshGlobalState(true)
	    .then(() => {
	      window[BOT_KEY] = bot;
	      if (previousBot && previousBot !== bot && previousBot.stop) {
	        try {
	          previousBot.stop('replaced by ' + cfg.version);
	        } catch (err) {
	          console.warn('[grasp-rat-bot] previous stop failed', err);
	        }
	      }
	      return tick('startup');
	    })
	    .then(() => {
	      if (!cfg.once && bot.running) {
	        bot.timer = setInterval(() => {
	          tick();
        }, cfg.tickMs);
      }
      logStatus(cfg.dryRun ? 'started dry-run' : 'started live control');
      return bot.status();
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
  process.stdout.write(browserBotSource({
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
