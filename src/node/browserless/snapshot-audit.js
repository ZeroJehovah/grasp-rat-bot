'use strict';

// Snapshot audit is deliberately a diagnostic-only projection.  It must not
// be fed back into profit, target, aim, fire, Dodge, or exit decisions.
const DEFAULT_DROP_AUDIT_THRESHOLD = 200;

let observationSequence = 0;

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstValue(entity, keys = []) {
  for (const key of keys) {
    if (entity && Object.prototype.hasOwnProperty.call(entity, key)
      && entity[key] !== null && entity[key] !== undefined && entity[key] !== '') {
      return entity[key];
    }
  }
  return undefined;
}

function entityDrop(entity) {
  return numberOrNull(firstValue(entity, [
    'drop', 'Drop', 'reward', 'coin_reward', 'death_reward_preview',
    'death_drop_coins', 'coins'
  ]));
}

function entityName(entity) {
  return String(firstValue(entity, [
    'name', 'label', 'username', 'user_name', 'displayName', 'display_name'
  ]) || '').trim();
}

function entityUserId(entity) {
  return numberOrNull(firstValue(entity, ['user_id', 'userId']));
}

function entityId(entity) {
  const value = firstValue(entity, ['entity_id', 'entityId', 'id']);
  return value === undefined ? null : String(value);
}

function booleanValue(entity, keys) {
  const value = firstValue(entity, keys);
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['true', 'yes', 'active', 'alive', 'moving', 'firing'].includes(normalized)) return true;
  if (['false', 'no', 'passive', 'dead', 'idle'].includes(normalized)) return false;
  return null;
}

function normalizeStamina(entity) {
  const fields = {};
  const aliases = {
    remaining5sMilli: ['stamina_5s_remaining_milli', 'stamina5sRemainingMilli', 'stamina_5s', 'stamina5s'],
    limit5sMilli: ['stamina_5s_limit_milli', 'stamina5sLimitMilli'],
    remaining1hMilli: ['stamina_1h_remaining_milli', 'stamina1hRemainingMilli', 'stamina_1h', 'stamina1h'],
    limit1hMilli: ['stamina_1h_limit_milli', 'stamina1hLimitMilli'],
    remaining1dMilli: ['stamina_1d_remaining_milli', 'stamina1dRemainingMilli', 'stamina_1d', 'stamina1d'],
    limit1dMilli: ['stamina_1d_limit_milli', 'stamina1dLimitMilli']
  };
  for (const [name, keys] of Object.entries(aliases)) {
    const value = numberOrNull(firstValue(entity, keys));
    if (value !== null) fields[name] = value;
  }
  return fields;
}

function normalizeInvulnerability(entity) {
  const remainingMs = numberOrNull(firstValue(entity, [
    'invulnerable_remaining_ms', 'invulnerableRemainingMs',
    'invulnerability_remaining_ms', 'invulnerabilityRemainingMs'
  ]));
  const remainingTicks = numberOrNull(firstValue(entity, [
    'invulnerable_remaining_ticks', 'invulnerableRemainingTicks',
    'invulnerability_remaining_ticks', 'invulnerabilityRemainingTicks'
  ]));
  const explicit = booleanValue(entity, ['invulnerable', 'is_invulnerable', 'isInvulnerable']);
  return {
    invulnerable: explicit === null ? (remainingMs !== null ? remainingMs > 0 : null) : explicit,
    remainingMs,
    remainingTicks,
    metadataAuthority: String(firstValue(entity, [
      'invulnerableMetadataAuthority', 'invulnerable_metadata_authority'
    ]) || '')
  };
}

function identityForEntity(entity) {
  const userId = entityUserId(entity);
  const id = entityId(entity);
  if (userId !== null) {
    return { identityKey: `user:${userId}`, userId, entityId: id, identityStable: true };
  }
  if (id !== null && id !== '') {
    return { identityKey: `entity:${id}`, userId: null, entityId: id, identityStable: false };
  }
  return { identityKey: '', userId: null, entityId: null, identityStable: false };
}

function snapshotKindFor(detail = {}) {
  if (detail.snapshotKind) return String(detail.snapshotKind);
  return String(detail.source || '').toLowerCase() === 'ws' ? 'ws' : 'http';
}

function globalSnapshotFor(detail = {}) {
  if (detail.global === true) return true;
  if (detail.global === false) return false;
  return String(detail.source || '').toLowerCase() !== 'ws';
}

function completeEntityListFor(detail = {}, global) {
  if (detail.completeEntityList !== undefined) return detail.completeEntityList === true;
  return global && snapshotKindFor(detail) === 'http';
}

function makeObservationId(atMs, tick, index) {
  observationSequence = (observationSequence + 1) % 1000000000;
  return `snapshot-${Math.max(0, Math.round(Number(atMs) || 0))}-${tick === null ? 'na' : tick}-${index}-${observationSequence}`;
}

function normalizeEntityObservation(entity, index, context) {
  if (!entity || typeof entity !== 'object') return { invalid: true };
  const drop = entityDrop(entity);
  const identity = identityForEntity(entity);
  const name = entityName(entity);
  const invulnerability = normalizeInvulnerability(entity);
  const x = numberOrNull(entity.x);
  const y = numberOrNull(entity.y);
  const vx = numberOrNull(entity.vx);
  const vy = numberOrNull(entity.vy);
  const hp = numberOrNull(entity.hp);
  const maxHp = numberOrNull(firstValue(entity, ['max_hp', 'maxHp']));
  const movingValue = booleanValue(entity, ['moving', 'is_moving', 'isMoving']);
  const speed = numberOrNull(firstValue(entity, ['speed', 'speed_per_tick', 'speedPerTick']));
  const moving = movingValue === null
    ? (speed !== null ? speed > 0 : (vx !== null && vy !== null ? Math.hypot(vx, vy) > 0 : null))
    : movingValue;
  const activeValue = booleanValue(entity, ['active', 'is_active', 'isActive']);
  const joinMode = String(firstValue(entity, ['current_join_mode', 'currentJoinMode', 'mode', 'joined']) || '');
  const active = activeValue === null
    ? (/^active$/i.test(joinMode) ? true : null)
    : activeValue;
  const firing = booleanValue(entity, ['firing', 'is_firing', 'isFiring', 'shooting']);
  const aliveValue = booleanValue(entity, ['alive']);
  const life = String(entity.life || '');
  const alive = aliveValue === null ? (!life || life.toLowerCase() !== 'dead') : aliveValue;
  const missingFields = [];
  for (const [field, value] of [['x', x], ['y', y], ['hp', hp], ['drop', drop]]) {
    if (value === null) missingFields.push(field);
  }
  const stamina = normalizeStamina(entity);
  return {
    type: 'player-observation',
    observedAt: context.observedAt,
    receivedAt: context.receivedAt,
    observationId: makeObservationId(context.observedAtMs, context.tick, index),
    source: context.source,
    global: context.global,
    snapshotKind: context.snapshotKind,
    snapshotPurpose: context.snapshotPurpose,
    tick: context.tick,
    generation: context.generation,
    entityIndex: index,
    entityCount: context.entityCount,
    completeEntityList: context.completeEntityList,
    userId: identity.userId,
    entityId: identity.entityId,
    identityKey: identity.identityKey,
    identityStable: identity.identityStable,
    name: name || null,
    nameSource: name ? 'snapshot' : 'missing',
    drop,
    dropKnown: drop !== null,
    aboveThreshold: drop !== null && drop > context.threshold,
    x,
    y,
    vx,
    vy,
    speed,
    hp,
    maxHp,
    life: life || null,
    alive,
    visible: booleanValue(entity, ['visible', 'is_visible', 'isVisible']),
    active,
    moving,
    firing,
    joinMode: joinMode || null,
    invulnerable: invulnerability.invulnerable,
    invulnerableRemainingMs: invulnerability.remainingMs,
    invulnerableRemainingTicks: invulnerability.remainingTicks,
    invulnerableMetadataAuthority: invulnerability.metadataAuthority || null,
    stamina,
    selfExcluded: false,
    sourceAuthority: 'snapshot',
    missingFields,
    normalizationErrors: []
  };
}

function buildSnapshotAudit(payload, detail = {}, options = {}) {
  const observedAtMs = Number.isFinite(Number(detail.observedAtMs))
    ? Number(detail.observedAtMs)
    : (typeof options.now === 'function' ? options.now() : Date.now());
  const receivedAtMs = Number.isFinite(Number(detail.receivedAtMs))
    ? Number(detail.receivedAtMs)
    : observedAtMs;
  const source = String(detail.source || 'snapshot');
  const global = globalSnapshotFor(detail);
  const snapshotKind = snapshotKindFor(detail);
  const completeEntityList = completeEntityListFor(detail, global);
  const threshold = Number.isFinite(Number(options.threshold))
    ? Number(options.threshold)
    : DEFAULT_DROP_AUDIT_THRESHOLD;
  const entities = payload && typeof payload === 'object' && Array.isArray(payload.entities)
    ? payload.entities
    : [];
  const valid = Boolean(payload && typeof payload === 'object' && Array.isArray(payload.entities));
  const tick = numberOrNull(payload?.tick);
  const generation = numberOrNull(detail.generation ?? payload?.generation);
  const selfUserId = numberOrNull(options.selfUserId ?? detail.selfUserId);
  const context = {
    observedAtMs,
    observedAt: new Date(observedAtMs).toISOString(),
    receivedAt: new Date(receivedAtMs).toISOString(),
    source,
    global,
    snapshotKind,
    snapshotPurpose: String(detail.snapshotPurpose || (source === 'ws' ? 'gameplay' : 'snapshot')),
    tick,
    generation,
    entityCount: entities.length,
    completeEntityList,
    threshold
  };
  const observations = [];
  let eligibleAboveThresholdCount = 0;
  let selfExcludedCount = 0;
  let invalidEntityCount = 0;
  let missingIdentityCount = 0;
  let stableIdentityCount = 0;
  let entityIdentityCount = 0;
  for (let index = 0; index < entities.length; index += 1) {
    const entity = entities[index];
    const normalized = normalizeEntityObservation(entity, index, context);
    if (normalized.invalid) {
      invalidEntityCount += 1;
      continue;
    }
    const identity = identityForEntity(entity);
    const drop = entityDrop(entity);
    const aboveThreshold = drop !== null && drop > threshold;
    if (aboveThreshold) eligibleAboveThresholdCount += 1;
    if (selfUserId !== null && identity.userId !== null && identity.userId === selfUserId) {
      selfExcludedCount += 1;
      continue;
    }
    if (!aboveThreshold) continue;
    if (!identity.identityKey) {
      missingIdentityCount += 1;
      continue;
    }
    if (identity.identityStable) stableIdentityCount += 1;
    else entityIdentityCount += 1;
    observations.push(normalized);
  }
  const summary = {
    type: 'snapshot-summary',
    observedAt: context.observedAt,
    receivedAt: context.receivedAt,
    observationId: makeObservationId(observedAtMs, tick, 'summary'),
    source,
    global,
    snapshotKind,
    snapshotPurpose: context.snapshotPurpose,
    tick,
    generation,
    entityCount: entities.length,
    valid,
    completeEntityList,
    completeHttpSnapshot: Boolean(valid && global && snapshotKind === 'http' && completeEntityList),
    eligibleAboveThresholdCount,
    playerObservationCount: observations.length,
    stableIdentityCount,
    entityIdentityCount,
    missingIdentityCount,
    selfExcludedCount,
    invalidEntityCount,
    aboveThreshold: eligibleAboveThresholdCount > 0,
    sourceAuthority: 'snapshot',
    absenceMeaning: valid && global && snapshotKind === 'http' && completeEntityList
      ? 'complete-global-snapshot-only'
      : 'presence-only'
  };
  return { ok: valid, summary, observations };
}

function createSnapshotAuditObserver(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const selfUserId = options.selfUserId;
  const threshold = Number.isFinite(Number(options.threshold))
    ? Number(options.threshold)
    : DEFAULT_DROP_AUDIT_THRESHOLD;
  return {
    observe(payload, detail = {}) {
      return buildSnapshotAudit(payload, detail, { now, selfUserId, threshold });
    },
    threshold
  };
}

function runSnapshotAuditSelfTest() {
  const atMs = Date.parse('2026-08-20T00:01:00.000Z');
  const base = {
    tick: 10,
    entities: [
      { entity_id: 1, user_id: 7, name: 'self', drop: 999 },
      { entity_id: 2, user_id: 8, name: '199', drop: 199 },
      { entity_id: 3, user_id: 9, name: '200', drop: 200 },
      { entity_id: 4, user_id: 10, name: '201', drop: 201, hp: 80, max_hp: 100, vx: 3, vy: 4 },
      { entity_id: 5, name: 'entity-only', drop: 202 },
      { name: 'no-id', drop: 203 }
    ]
  };
  const http = buildSnapshotAudit(base, {
    source: 'prelogin-http',
    global: true,
    observedAtMs: atMs,
    receivedAtMs: atMs + 5,
    snapshotPurpose: 'exit-recovery-confirmation'
  }, { selfUserId: 7 });
  const ws = buildSnapshotAudit({ tick: 11, entities: [{ entity_id: 4, user_id: 10, drop: 201 }] }, {
    source: 'ws',
    global: false,
    observedAtMs: atMs + 1000
  }, { selfUserId: 7 });
  const duplicate = buildSnapshotAudit(base, { source: 'ws', observedAtMs: atMs + 2000 }, { selfUserId: 7 });
  return {
    ok: http.ok
      && http.summary.completeHttpSnapshot
      && http.summary.eligibleAboveThresholdCount === 4
      && http.summary.playerObservationCount === 2
      && http.summary.selfExcludedCount === 1
      && http.summary.entityIdentityCount === 1
      && http.summary.missingIdentityCount === 1
      && http.observations.some(item => item.identityKey === 'user:10' && item.drop === 201)
      && http.observations.some(item => item.identityKey === 'entity:5' && item.identityStable === false)
      && ws.summary.absenceMeaning === 'presence-only'
      && duplicate.observations.length === 2
      && http.observations[0]?.observationId !== duplicate.observations[0]?.observationId,
    http,
    ws,
    duplicate
  };
}

module.exports = {
  DEFAULT_DROP_AUDIT_THRESHOLD,
  buildSnapshotAudit,
  createSnapshotAuditObserver,
  entityDrop,
  runSnapshotAuditSelfTest
};
