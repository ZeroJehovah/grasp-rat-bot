'use strict';

const {
  protocolInvulnerabilityMsFrom,
  rawInvulnerabilityMsFrom
} = require('./invulnerability-time');
const { estimateEightWayRouteCore } = require('./eight-way-route-eta');

const DEFAULT_REMOTE_PROFIT_TARGET_CONFIG = Object.freeze({
  minDrop: 50,
  centerRadiusCm: 100000,
  easyKillScoreOneMaxDistanceCm: 50000,
  distanceFullFactorMaxCm: 50000,
  distanceHalfFactorCm: 150000,
  distanceFloorFactor: 0.5,
  staminaFullRatio: 0.98,
  invulnerableAfkApproachDistanceCm: 1000,
  invulnerableActiveApproachDistanceCm: 15000,
  invulnerableAxisSpeedCmPerSec: 950,
  invulnerableDiagonalSpeedCmPerSec: 940,
  invulnerableRouteSegmentOverheadMs: 120,
  invulnerableAfkApproachSlackMs: 10000,
  maxCandidates: 64,
  arrivalToleranceCm: 1000
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableId(value) {
  const number = finiteNumber(value);
  return number === null ? null : number;
}

function entityUserId(entity) {
  return stableId(entity?.userId ?? entity?.user_id ?? entity?.targetUserId ?? entity?.target_user_id);
}

function entityDrop(entity) {
  return finiteNumber(
    entity?.drop
      ?? entity?.Drop
      ?? entity?.reward
      ?? entity?.coin_reward
      ?? entity?.death_reward_preview
      ?? entity?.death_drop_coins
      ?? entity?.coins
  );
}

function entityName(entity) {
  return String(
    entity?.name
      || entity?.label
      || entity?.username
      || entity?.user_name
      || entity?.displayName
      || entity?.display_name
      || ''
  ).trim();
}

function entityPoint(entity) {
  const x = finiteNumber(entity?.x);
  const y = finiteNumber(entity?.y);
  return x === null || y === null ? null : { x, y };
}

function entityJoinModeActive(entity) {
  return entity?.joinModeActive === true
    || String(
      entity?.current_join_mode
        ?? entity?.mode
        ?? entity?.joined
        ?? ''
    ).toLowerCase() === 'active';
}

function distanceBetween(a, b) {
  const first = entityPoint(a);
  const second = entityPoint(b);
  return first && second ? Math.hypot(first.x - second.x, first.y - second.y) : Infinity;
}

function remoteProfitDistanceFactor(distance, config = {}) {
  const fullAt = Math.max(0, Number(config.distanceFullFactorMaxCm ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.distanceFullFactorMaxCm));
  const halfAt = Math.max(fullAt, Number(config.distanceHalfFactorCm ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.distanceHalfFactorCm));
  const floor = Math.max(0, Math.min(1, Number(config.distanceFloorFactor ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.distanceFloorFactor)));
  const value = Number(distance);
  if (!Number.isFinite(value)) return null;
  if (value <= fullAt) return 1;
  if (value >= halfAt) return floor;
  const ratio = (value - fullAt) / Math.max(1, halfAt - fullAt);
  return 1 - ratio * (1 - floor);
}

function remoteProfitApproachDistanceCm(classification = '', config = {}) {
  const active = String(classification || '') === 'easy-kill-active';
  const configured = active
    ? config.invulnerableActiveApproachDistanceCm
    : config.invulnerableAfkApproachDistanceCm;
  const fallback = active
    ? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.invulnerableActiveApproachDistanceCm
    : DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.invulnerableAfkApproachDistanceCm;
  return Math.max(0, Number(configured ?? config.invulnerableApproachDistanceCm ?? fallback));
}

function remoteProfitApproachEtaMs(distance, config = {}, classification = '', from = null, to = null) {
  const value = Number(distance);
  const approachDistance = remoteProfitApproachDistanceCm(classification, config);
  if (!Number.isFinite(value)) return null;
  return estimateEightWayRouteCore(from || { distance: value }, to || {}, {
    arrivalRadiusCm: approachDistance,
    distanceCm: value,
    axisSpeedCmPerSec: config.invulnerableAxisSpeedCmPerSec
      ?? config.invulnerableProfitAxisSpeedCmPerSec
      ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.invulnerableAxisSpeedCmPerSec,
    diagonalSpeedCmPerSec: config.invulnerableDiagonalSpeedCmPerSec
      ?? config.invulnerableProfitDiagonalSpeedCmPerSec
      ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.invulnerableDiagonalSpeedCmPerSec,
    segmentOverheadMs: config.invulnerableRouteSegmentOverheadMs
      ?? config.invulnerableProfitRouteSegmentOverheadMs
      ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.invulnerableRouteSegmentOverheadMs
  }).etaMs;
}

function basicNormalizedEntity(entity, options = {}) {
  const joinModeActive = entityJoinModeActive(entity);
  const vx = finiteNumber(entity?.vx) ?? 0;
  const vy = finiteNumber(entity?.vy) ?? 0;
  const speed = finiteNumber(entity?.speed ?? entity?.speed_per_tick ?? entity?.speedPerTick) ?? Math.hypot(vx, vy);
  const moving = entity?.moving === true || entity?.recentlyMoved === true
    || speed >= Math.max(0, Number(options.activeSpeedMin ?? 5));
  const firing = Boolean(entity?.firing || entity?.is_firing || entity?.shooting);
  const life = String(entity?.life || '').toLowerCase();
  const alive = !life || life === 'alive';
  const stamina1dRemaining = finiteNumber(entity?.stamina1dRemaining ?? entity?.stamina_1d_remaining_milli ?? entity?.stamina_1d_remaining_ms ?? entity?.stamina_1d);
  const stamina1dLimit = finiteNumber(entity?.stamina1dLimit ?? entity?.stamina_1d_limit_milli ?? entity?.stamina_1d_limit_ms ?? entity?.stamina_1d_limit);
  const invulnerableRemainingMs = options.rawProtocolFields === true
    ? protocolInvulnerabilityMsFrom(entity)
    : (finiteNumber(entity?.invulnerableRemainingMs) ?? rawInvulnerabilityMsFrom(entity));
  return {
    ...entity,
    userId: entityUserId(entity),
    x: finiteNumber(entity?.x),
    y: finiteNumber(entity?.y),
    hp: finiteNumber(entity?.hp),
    drop: entityDrop(entity),
    name: entityName(entity),
    joinModeActive,
    moving,
    firing,
    active: Boolean(entity?.active || moving || firing || (joinModeActive && entity?.staminaFull !== true)),
    alive,
    invulnerable: Boolean(entity?.invulnerable || invulnerableRemainingMs > 0),
    invulnerableRemainingMs,
    stamina1dRemaining,
    stamina1dLimit,
    recentActivity: Boolean(entity?.recentActivity || entity?.recentlyActive)
  };
}

function normalizeTarget(entity, helpers = {}, options = {}) {
  const normalized = typeof helpers.normalizeEntity === 'function'
    ? helpers.normalizeEntity(entity, options)
    : basicNormalizedEntity(entity, options);
  if (!normalized || typeof normalized !== 'object') return null;
  const point = entityPoint(normalized);
  return {
    ...normalized,
    userId: entityUserId(normalized),
    x: point?.x ?? null,
    y: point?.y ?? null,
    hp: finiteNumber(normalized.hp),
    drop: entityDrop(normalized),
    name: entityName(normalized),
    joinModeActive: entityJoinModeActive(normalized)
  };
}

function finiteConfigNumber(value, fallback, minimum = -Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, number);
}

function staminaWindow(target, helpers = {}, options = {}) {
  if (typeof helpers.staminaWindow === 'function') {
    const value = helpers.staminaWindow(target, '1d', options);
    if (value && typeof value === 'object') return {
      remaining: finiteNumber(value.remaining),
      limit: finiteNumber(value.limit),
      full: Boolean(value.full)
    };
  }
  const remaining = finiteNumber(target?.stamina1dRemaining ?? target?.stamina_1d_remaining_milli ?? target?.stamina_1d_remaining_ms ?? target?.stamina_1d);
  const limit = finiteNumber(target?.stamina1dLimit ?? target?.stamina_1d_limit_milli ?? target?.stamina_1d_limit_ms ?? target?.stamina_1d_limit);
  const ratio = Math.max(0, Number(options.staminaFullRatio ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.staminaFullRatio));
  return { remaining, limit, full: remaining !== null && limit !== null && limit > 0 && remaining >= limit * ratio };
}

function easyKillMap(players = []) {
  const map = new Map();
  for (const player of players || []) {
    const userId = entityUserId(player);
    const score = Math.round(Number(player?.score));
    if (userId === null || !Number.isFinite(score) || score < 1 || score > 3) continue;
    map.set(String(userId), { userId, score });
  }
  return map;
}

function idSet(values = []) {
  return new Set((values || []).map(value => stableId(value)).filter(value => value !== null).map(String));
}

function classifyRemoteTarget(target, context, config, helpers) {
  if (!target || typeof target !== 'object') return { reject: 'invalid-entity' };
  const userId = target.userId;
  const id = String(userId);
  const drop = target.drop;
  if (userId === null) return { reject: 'missing-user-id' };
  if (id === String(context.selfUserId ?? '')) return { reject: 'self' };
  if (context.whitelistIds.has(id)) return { reject: 'whitelisted' };
  if (target.alive === false) return { reject: 'dead' };
  if (target.x === null || target.y === null || target.hp === null || drop === null) return { reject: 'non-finite-entity' };
  if (drop < config.minDrop) return { reject: 'drop-below-minimum' };
  const centerDistance = Math.hypot(target.x, target.y);
  if (!Number.isFinite(centerDistance) || centerDistance > config.centerRadiusCm) return { reject: 'outside-center-radius' };
  const distance = distanceBetween(context.self, target);
  if (!Number.isFinite(distance)) return { reject: 'non-finite-distance' };

  const easy = context.easyKills.get(id) || null;
  const joinModeActive = entityJoinModeActive(target);
  const window = staminaWindow(target, helpers, config);
  const highDropAfk = target.hp === 100
    && window.remaining !== null
    && window.limit !== null
    && window.limit > 0
    && window.remaining >= window.limit * config.staminaFullRatio
    && !joinModeActive
    && !target.moving
    && !target.firing
    && !target.active
    && !target.recentActivity;
  const easyKillActive = Boolean(easy)
    && target.hp > 0
    && Boolean(target.active || joinModeActive || target.moving || target.firing);
  let classification = '';
  let score = null;
  if (highDropAfk && easyKillActive && context.diagnostics) {
    context.diagnostics.classificationConflictCount += 1;
  }
  if (easyKillActive) {
    if (easy.score === 1 && distance > config.easyKillScoreOneMaxDistanceCm) return { reject: 'easy-kill-score-one-distance' };
    classification = 'easy-kill-active';
    score = easy.score;
  } else if (highDropAfk) {
    classification = 'high-drop-afk';
  } else {
    return { reject: joinModeActive ? 'active-join-mode' : (easy ? 'not-active-or-afk' : 'not-qualified-class') };
  }

  const invulnerableRemainingMs = finiteNumber(target.invulnerableRemainingMs);
  const invulnerable = Boolean(target.invulnerable || (invulnerableRemainingMs !== null && invulnerableRemainingMs > 0));
  const approachDistanceCm = remoteProfitApproachDistanceCm(classification, config);
  const approachEtaMs = remoteProfitApproachEtaMs(distance, config, classification, context.self, target);
  const approachSlackMs = classification === 'high-drop-afk'
    ? Math.max(0, Number(config.invulnerableAfkApproachSlackMs
      ?? config.invulnerableProfitApproachSlackMs
      ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.invulnerableAfkApproachSlackMs))
    : 0;
  if (invulnerable && (
    invulnerableRemainingMs === null
      || approachEtaMs === null
      || invulnerableRemainingMs > approachEtaMs + approachSlackMs
  )) return { reject: 'invulnerable-not-ready-on-approach' };

  const scoringTarget = {
    ...target,
    // The normalized snapshot may be full-stamina Active and therefore have
    // `active === false` in the shared helper. Classification is the remote
    // policy authority: easy-kill candidates must use the active-player
    // completion/risk economics, while AFK candidates use deterministic AFK
    // economics.
    active: classification === 'easy-kill-active',
    easyKillScore: score,
    distance
  };
  const economics = typeof helpers.scoreTarget === 'function'
    ? helpers.scoreTarget(scoringTarget, { classification, easyKillScore: score, distance, context, config })
    : null;
  const hasEconomics = Boolean(economics && typeof economics === 'object');
  const hasOwn = key => hasEconomics && Object.prototype.hasOwnProperty.call(economics, key);
  const expectedReward = finiteNumber(hasOwn('expectedReward') ? economics.expectedReward : drop);
  const staminaCost = finiteNumber(hasOwn('staminaCost') ? economics.staminaCost : 0);
  const baseValue = hasOwn('baseScore')
    ? economics.baseScore
    : (hasOwn('score')
      ? economics.score
      : (expectedReward !== null && staminaCost !== null && staminaCost > 0 ? expectedReward / staminaCost : expectedReward));
  const baseScore = finiteNumber(baseValue);
  const distanceFactor = remoteProfitDistanceFactor(distance, config);
  const adjustedScore = baseScore !== null && distanceFactor !== null ? baseScore * distanceFactor : null;
  if (!(expectedReward > 0)
    || staminaCost === null
    || !(staminaCost >= 0)
    || !(baseScore > 0)
    || !(adjustedScore > 0)) return { reject: 'non-positive-score' };
  return {
    candidate: {
      userId,
      name: target.name,
      x: target.x,
      y: target.y,
      hp: target.hp,
      drop,
      active: Boolean(target.active || joinModeActive || target.moving || target.firing),
      moving: Boolean(target.moving),
      firing: Boolean(target.firing),
      invulnerable,
      invulnerableRemainingMs,
      classification,
      easyKillScore: score,
      distance,
      centerDistance,
      approachDistanceCm,
      approachEtaMs,
      approachSlackMs,
      expectedReward,
      staminaCost,
      baseScore,
      distanceFactor,
      adjustedScore
    }
  };
}

function evaluateRemoteProfitTargets(request = {}, helpers = {}) {
  const sourceConfig = request.config && typeof request.config === 'object' ? request.config : {};
  const config = {
    ...DEFAULT_REMOTE_PROFIT_TARGET_CONFIG,
    ...sourceConfig,
    minDrop: finiteConfigNumber(sourceConfig.minDrop ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.minDrop, DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.minDrop, 0),
    centerRadiusCm: finiteConfigNumber(sourceConfig.centerRadiusCm ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.centerRadiusCm, DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.centerRadiusCm, 0),
    maxCandidates: Math.max(1, Math.min(64, Math.round(finiteConfigNumber(
      sourceConfig.maxCandidates ?? DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.maxCandidates,
      DEFAULT_REMOTE_PROFIT_TARGET_CONFIG.maxCandidates,
      1
    ))))
  };
  const self = request.self && typeof request.self === 'object' ? request.self : null;
  const selfPoint = entityPoint(self);
  const diagnostics = {
    inputCount: Array.isArray(request.entities) ? request.entities.length : 0,
    normalizedCount: 0,
    candidateCount: 0,
    highDropAfkCount: 0,
    easyKillActiveCount: 0,
    classificationConflictCount: 0,
    filtered: {}
  };
  const reject = reason => {
    diagnostics.filtered[reason] = Number(diagnostics.filtered[reason] || 0) + 1;
  };
  if (!selfPoint || request.online === false) {
    reject(!selfPoint ? 'missing-realtime-self' : 'offline-session');
    return { generation: Number(request.generation || 0), candidates: [], diagnostics };
  }
  const context = {
    self,
    selfUserId: entityUserId(self) ?? request.selfUserId,
    easyKills: easyKillMap(request.easyKillPlayers),
    whitelistIds: idSet(request.whitelistUserIds),
    diagnostics
  };
  const candidates = [];
  const seen = new Set();
  for (const entity of request.entities || []) {
    const target = normalizeTarget(entity, helpers, config);
    diagnostics.normalizedCount += target ? 1 : 0;
    const userId = entityUserId(target || entity);
    if (userId !== null && seen.has(String(userId))) {
      reject('duplicate-user-id');
      continue;
    }
    if (userId !== null) seen.add(String(userId));
    const result = classifyRemoteTarget(target, context, config, helpers);
    if (result.reject) {
      reject(result.reject);
      continue;
    }
    if (result.candidate.classification === 'high-drop-afk') diagnostics.highDropAfkCount += 1;
    if (result.candidate.classification === 'easy-kill-active') diagnostics.easyKillActiveCount += 1;
    candidates.push(result.candidate);
  }
  candidates.sort((a, b) => Number(b.adjustedScore) - Number(a.adjustedScore)
    || Number(b.drop) - Number(a.drop)
    || Number(a.distance) - Number(b.distance)
    || Number(a.userId) - Number(b.userId));
  diagnostics.candidateCount = candidates.length;
  const limited = candidates.slice(0, config.maxCandidates);
  return {
    generation: Number(request.generation || 0),
    tick: request.tick ?? null,
    source: String(request.source || ''),
    observedAtMs: finiteNumber(request.observedAtMs),
    candidates: limited,
    diagnostics: {
      ...diagnostics,
      returnedCount: limited.length,
      truncatedCount: Math.max(0, candidates.length - limited.length)
    }
  };
}

function buildRemotePlayerNavigationOpportunitiesCore(candidates = [], options = {}) {
  const output = [];
  for (const candidate of candidates || []) {
    const userId = entityUserId(candidate);
    const x = finiteNumber(candidate?.x);
    const y = finiteNumber(candidate?.y);
    const score = finiteNumber(candidate?.adjustedScore);
    if (userId === null || x === null || y === null || !(score > 0)) continue;
    const sourceTarget = {
      ...candidate,
      user_id: userId,
      userId,
      entity_id: null,
      authority: 'snapshot-navigation',
      remoteNavigationOnly: true,
      type: 'enemy'
    };
    output.push({
      type: 'remote-player-navigation',
      id: userId,
      x,
      y,
      distance: finiteNumber(candidate.distance),
      amount: finiteNumber(candidate.drop),
      reward: finiteNumber(candidate.expectedReward),
      expectedReward: finiteNumber(candidate.expectedReward),
      staminaCost: finiteNumber(candidate.staminaCost),
      score,
      selectionScore: score,
      baseScore: finiteNumber(candidate.baseScore),
      distanceFactor: finiteNumber(candidate.distanceFactor),
      adjustedScore: score,
      scoreAuthority: 'adjusted-distance-score',
      priorityTier: 1,
      actionKind: 'seek-remote-player',
      reason: 'remote-snapshot-profit-target',
      authority: 'snapshot-navigation',
      remoteNavigationOnly: true,
      remoteClassification: candidate.classification || '',
      generation: Number(options.generation ?? candidate.generation ?? 0),
      snapshotAt: options.snapshotAt || candidate.snapshotAt || '',
      sourceTarget
    });
  }
  return output;
}

module.exports = {
  DEFAULT_REMOTE_PROFIT_TARGET_CONFIG,
  buildRemotePlayerNavigationOpportunitiesCore,
  distanceBetween,
  evaluateRemoteProfitTargets,
  remoteProfitApproachDistanceCm,
  remoteProfitApproachEtaMs,
  remoteProfitDistanceFactor
};
