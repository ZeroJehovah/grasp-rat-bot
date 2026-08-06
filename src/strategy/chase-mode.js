'use strict';

const { rawInvulnerabilityMsFrom } = require('./invulnerability-time');

const CHASE_MODE_STATE_VERSION = 1;
const CHASE_INVULNERABLE_TICK_MS = 50;

const INVULNERABLE_MS_FIELDS = [
  'invulnerable_remaining_ms',
  'invincible_remaining_ms',
  'invulnerability_remaining_ms',
  'invulnerableRemainingMs',
  'invincibleRemainingMs',
  'invulnerabilityRemainingMs',
  'invulnerable_ms',
  'invincible_ms',
  'invulnerability_ms',
  'immune_remaining_ms',
  'immuneRemainingMs'
];

const INVULNERABLE_TICK_FIELDS = [
  'invulnerable_remaining_ticks',
  'invincible_remaining_ticks',
  'invulnerability_remaining_ticks',
  'invulnerableTicks',
  'invulnerableRemainingTicks',
  'invincibleRemainingTicks',
  'invulnerabilityRemainingTicks',
  'invulnerable_ticks',
  'invincible_ticks',
  'invulnerability_ticks',
  'invulnerable_tick',
  'invincible_tick',
  'invulnerability_tick'
];

const INVULNERABLE_GENERIC_REMAINING_FIELDS = [
  'invulnerable_remaining',
  'invincible_remaining',
  'invulnerability_remaining',
  'invulnerableRemaining',
  'invincibleRemaining',
  'invulnerabilityRemaining'
];

const INVULNERABLE_FLAG_FIELDS = [
  'invulnerable',
  'is_invulnerable',
  'isInvulnerable',
  'immune',
  'is_immune'
];

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOrUndefined(value) {
  const number = finiteNumber(value);
  return number === null ? undefined : number;
}

function roundedOrNull(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.round(number);
}

function truthyFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function positiveFieldValue(source, fields) {
  if (!source || typeof source !== 'object') return null;
  let picked = null;
  for (const field of fields) {
    const value = finiteNumber(source[field]);
    if (value === null || value <= 0) continue;
    picked = picked === null ? value : Math.max(picked, value);
  }
  return picked;
}

function chaseInvulnerableState(target) {
  const canonicalMs = positiveFieldValue(target, [
    'invulnerableRemainingMs',
    'invincibleRemainingMs',
    'invulnerabilityRemainingMs',
    'immuneRemainingMs'
  ]);
  const rawRemainingMs = rawInvulnerabilityMsFrom(target);
  const remainingMs = canonicalMs !== null
    ? canonicalMs
    : rawInvulnerabilityMsToWallMs(rawRemainingMs);
  const remainingTicks = positiveFieldValue(target, INVULNERABLE_TICK_FIELDS);
  const genericRemaining = positiveFieldValue(target, INVULNERABLE_GENERIC_REMAINING_FIELDS);
  const resolvedTicks = remainingTicks !== null ? remainingTicks : genericRemaining;
  const resolvedMs = remainingMs !== null
    ? remainingMs
    : (resolvedTicks !== null ? resolvedTicks * CHASE_INVULNERABLE_TICK_MS : null);
  const flag = INVULNERABLE_FLAG_FIELDS.some(field => truthyFlag(target?.[field]));
  return {
    invulnerable: Boolean(flag || remainingMs !== null || resolvedTicks !== null),
    invulnerableRemainingMs: resolvedMs === null ? null : Math.max(0, Math.round(resolvedMs)),
    invulnerableRemainingTicks: resolvedTicks === null ? null : Math.max(0, Math.round(resolvedTicks))
  };
}

function explicitObservedAtValue(target) {
  if (!target || typeof target !== 'object') return 0;
  const explicit = Boolean(target.observedAtExplicit || target.explicitObservedAt || target.hasExplicitObservedAt);
  const value = finiteNumber(target.explicitObservedAt ?? (explicit ? target.observedAt : null));
  return value === null ? 0 : Math.max(0, Math.round(value));
}

function chaseExplicitObservationForItem(item, options = {}) {
  const ownAt = finiteNumber(item?.observedAt ?? item?.lastSeenAt);
  if (ownAt !== null && ownAt > 0) return { observedAt: ownAt, observedAtExplicit: true };
  const snapshotAt = finiteNumber(options.snapshotRefreshedAt);
  const snapshotLike = Boolean(item?.snapshot || item?.global || !item?.native || options.source === 'minimap');
  const nativeOnlyGlobal = Boolean(item?.native && !item?.snapshot && item?.global);
  if (snapshotAt !== null && snapshotAt > 0 && snapshotLike && !nativeOnlyGlobal) {
    return { observedAt: snapshotAt, observedAtExplicit: true };
  }
  return { observedAt: 0, observedAtExplicit: false };
}

function withChaseExplicitObservation(item, options = {}) {
  return { ...item, ...chaseExplicitObservationForItem(item, options) };
}

function chaseTargetId(target) {
  const id = target?.id ?? target?.user_id ?? target?.userId ?? target?.targetId;
  if (id === undefined || id === null || id === '') return '';
  return String(id);
}

function chaseTargetName(target) {
  return String(target?.name || target?.label || '').trim();
}

function chaseDropValue(target) {
  const value = finiteNumber(target?.drop ?? target?.death_reward_preview ?? target?.death_drop_coins ?? target?.lastDrop ?? target?.dropAtMark);
  return value === null ? null : Math.max(0, Math.round(value));
}

function chaseHpValue(target) {
  const value = finiteNumber(target?.hp ?? target?.knownHp ?? target?.lastHp);
  return value === null ? null : Math.max(0, Math.round(value));
}

function targetPoint(target) {
  const x = finiteNumber(target?.x ?? target?.lastX);
  const y = finiteNumber(target?.y ?? target?.lastY);
  return x === null || y === null ? null : { x, y };
}

function defaultDistance(a, b) {
  const ax = finiteNumber(a?.x);
  const ay = finiteNumber(a?.y);
  const bx = finiteNumber(b?.x);
  const by = finiteNumber(b?.y);
  if (ax === null || ay === null || bx === null || by === null) return Infinity;
  return Math.hypot(ax - bx, ay - by);
}

function normalizeChaseModeState(raw, options = {}) {
  const limit = Math.max(1, Math.round(Number(options.persistMax || 20) || 20));
  const state = raw && typeof raw === 'object' ? raw : {};
  const targets = [];
  const seen = new Set();
  for (const item of Array.isArray(state.targets) ? state.targets : []) {
    const id = chaseTargetId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const markedAt = Number(item.markedAt || item.at || state.updatedAt || 0) || 0;
    const lastSeenAt = Number(item.lastSeenAt || 0) || 0;
    const dropAtMark = chaseDropValue({ drop: item.dropAtMark ?? item.drop ?? item.lastDrop });
    targets.push({
      id,
      name: chaseTargetName(item),
      dropAtMark,
      lastDrop: chaseDropValue(item),
      lastHp: chaseHpValue(item),
      lastX: finiteOrUndefined(item.lastX ?? item.x),
      lastY: finiteOrUndefined(item.lastY ?? item.y),
      lastDistance: roundedOrNull(item.lastDistance ?? item.distance),
      lastSeenAt,
      lastSource: String(item.lastSource || item.source || 'persisted'),
      markedAt,
      markedBy: String(item.markedBy || 'panel')
    });
    if (targets.length >= limit) break;
  }
  return {
    version: CHASE_MODE_STATE_VERSION,
    updatedAt: Number(state.updatedAt || 0) || 0,
    targets
  };
}

function normalizeChaseCandidate(raw, options = {}) {
  const id = chaseTargetId(raw);
  if (!id) return null;
  const self = options.self || null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDistance;
  const source = String(options.source || raw?.source || raw?.nativeSource || raw?.lastSource || 'unknown');
  const point = targetPoint(raw);
  const distance = finiteNumber(raw?.distance ?? raw?.lastDistance);
  const computedDistance = distance !== null
    ? distance
    : (self && point ? dist(self, point) : Infinity);
  const rawObservedAt = finiteNumber(raw?.observedAt ?? raw?.lastSeenAt);
  const explicitObservedAt = rawObservedAt !== null && (raw?.observedAtExplicit !== false)
    ? Math.max(0, Math.round(rawObservedAt))
    : explicitObservedAtValue(raw);
  const observedAt = rawObservedAt !== null
    ? rawObservedAt
    : (Number(options.nowMs || Date.now()) || 0);
  const nativeVisible = Boolean(
    raw?.native
    || raw?.realtime
    || raw?.render
    || source === 'native'
    || source === 'realtime'
    || source === 'render'
  ) && !raw?.minimapOnly;
  const minimapOnly = Boolean(raw?.minimapOnly || source === 'minimap');
  const drop = chaseDropValue(raw);
  const hp = chaseHpValue(raw);
  const invulnerableState = chaseInvulnerableState(raw);
  return {
    id,
    user_id: raw.user_id ?? raw.userId ?? raw.id ?? id,
    name: chaseTargetName(raw),
    x: point ? point.x : undefined,
    y: point ? point.y : undefined,
    hp,
    drop,
    latestDrop: drop,
    distance: Number.isFinite(computedDistance) ? computedDistance : Infinity,
    source,
    sources: [source],
    native: Boolean(raw?.native || source === 'native'),
    realtime: Boolean(raw?.realtime || source === 'realtime'),
    render: Boolean(raw?.render || source === 'render'),
    snapshot: Boolean(raw?.snapshot || raw?.global || source === 'snapshot'),
    minimapOnly,
    visible: nativeVisible,
    attackableNow: false,
    seekableNow: Boolean(point),
    observedAt,
    observedAtExplicit: explicitObservedAt > 0,
    explicitObservedAt,
    stale: Boolean(raw?.stale),
    mode: raw?.current_join_mode || raw?.mode || '',
    life: raw?.life || '',
    invulnerable: invulnerableState.invulnerable,
    invulnerableRemainingMs: invulnerableState.invulnerableRemainingMs,
    invulnerableRemainingTicks: invulnerableState.invulnerableRemainingTicks,
    whitelisted: Boolean(raw?.whitelisted),
    active: Boolean(raw?.active || raw?.currentlyActive),
    afk: raw?.afk === undefined ? undefined : Boolean(raw.afk)
  };
}

function sourceRank(candidate) {
  if (!candidate) return 0;
  if (candidate.visible || candidate.native || candidate.render || candidate.realtime) return 50;
  if (candidate.snapshot) return 30;
  if (candidate.minimapOnly) return 20;
  if (candidate.source === 'persisted') return 10;
  return 1;
}

function mergeChaseCandidate(previous, next, options = {}) {
  if (!previous) return next;
  if (!next) return previous;
  const previousRank = sourceRank(previous);
  const nextRank = sourceRank(next);
  const preferNextPosition = nextRank > previousRank
    || (nextRank === previousRank && Number(next.observedAt || 0) >= Number(previous.observedAt || 0));
  const preferNextStatus = preferNextPosition;
  const nearMs = Math.max(0, Number(options.nearMs || 2000) || 2000);
  const previousDrop = finiteNumber(previous.drop);
  const nextDrop = finiteNumber(next.drop);
  const nextLatestDrop = finiteNumber(next.latestDrop);
  const previousLatestDrop = finiteNumber(previous.latestDrop);
  const closeObservation = Math.abs(Number(next.observedAt || 0) - Number(previous.observedAt || 0)) <= nearMs;
  const explicitObservedAt = Math.max(explicitObservedAtValue(previous), explicitObservedAtValue(next));
  let displayDrop = previousDrop;
  if (nextDrop !== null) {
    if (displayDrop === null) displayDrop = nextDrop;
    else if (closeObservation) displayDrop = Math.max(displayDrop, nextDrop);
    else if (Number(next.observedAt || 0) >= Number(previous.observedAt || 0)) displayDrop = nextDrop;
  }
  const latestDrop = nextLatestDrop !== null && Number(next.observedAt || 0) >= Number(previous.observedAt || 0)
    ? nextLatestDrop
    : (previousLatestDrop !== null ? previousLatestDrop : displayDrop);
  const sources = Array.from(new Set([...(previous.sources || [previous.source]).filter(Boolean), ...(next.sources || [next.source]).filter(Boolean)]));
  return {
    ...previous,
    ...next,
    name: next.name || previous.name,
    x: preferNextPosition && next.x !== undefined ? next.x : previous.x,
    y: preferNextPosition && next.y !== undefined ? next.y : previous.y,
    hp: next.hp !== null && next.hp !== undefined && (preferNextPosition || previous.hp === null || previous.hp === undefined) ? next.hp : previous.hp,
    drop: displayDrop,
    latestDrop,
    distance: preferNextPosition && Number.isFinite(next.distance) ? next.distance : previous.distance,
    source: preferNextPosition ? next.source : previous.source,
    sources,
    native: Boolean(previous.native || next.native),
    realtime: Boolean(previous.realtime || next.realtime),
    render: Boolean(previous.render || next.render),
    snapshot: Boolean(previous.snapshot || next.snapshot),
    minimapOnly: Boolean((previous.minimapOnly && next.minimapOnly) || (!previous.visible && next.minimapOnly)),
    visible: Boolean(previous.visible || next.visible),
    seekableNow: Boolean(previous.seekableNow || next.seekableNow),
    invulnerable: preferNextStatus ? Boolean(next.invulnerable) : Boolean(previous.invulnerable),
    invulnerableRemainingMs: preferNextStatus ? next.invulnerableRemainingMs : previous.invulnerableRemainingMs,
    invulnerableRemainingTicks: preferNextStatus ? next.invulnerableRemainingTicks : previous.invulnerableRemainingTicks,
    observedAt: Math.max(Number(previous.observedAt || 0), Number(next.observedAt || 0)),
    observedAtExplicit: explicitObservedAt > 0,
    explicitObservedAt,
    stale: Boolean(previous.stale && next.stale)
  };
}

function aggregateChaseCandidates(sources = [], options = {}) {
  const byId = new Map();
  for (const source of sources || []) {
    const list = Array.isArray(source?.items) ? source.items : [];
    for (const raw of list) {
      const candidate = normalizeChaseCandidate(raw, {
        ...options,
        source: source.source || source.label || raw?.source
      });
      if (!candidate) continue;
      const previous = byId.get(candidate.id);
      byId.set(candidate.id, mergeChaseCandidate(previous, candidate, options));
    }
  }
  return Array.from(byId.values());
}

function buildChaseSourceListsCore(context = {}, options = {}) {
  const snapshotRefreshedAt = Number(options.snapshotRefreshedAt || 0) || 0;
  const withObservation = (item, source = '') => withChaseExplicitObservation(item, { snapshotRefreshedAt, source });
  const lists = [];
  const nativeItems = Array.isArray(context.realtimeEntities)
    ? context.realtimeEntities
    : (Array.isArray(options.nativeEntities) ? options.nativeEntities : null);
  if (Array.isArray(nativeItems)) lists.push({ source: 'native', items: nativeItems });
  const snapshotItems = Array.isArray(context.entities)
    ? context.entities.filter(item => item?.snapshot || item?.global || !item?.native)
    : (Array.isArray(options.globalEntities) ? options.globalEntities : null);
  if (Array.isArray(snapshotItems)) lists.push({ source: 'snapshot', items: snapshotItems.map(item => withObservation(item, 'snapshot')) });
  if (Array.isArray(context.globalTargets)) {
    lists.push({ source: 'snapshot', items: context.globalTargets.map(item => withObservation(item, 'snapshot')) });
  }
  if (Array.isArray(context.minimapDropTargets)) {
    lists.push({ source: 'minimap', items: context.minimapDropTargets.map(item => withObservation(item, 'minimap')) });
  } else if (Array.isArray(options.minimapPoints)) {
    lists.push({
      source: 'minimap',
      items: options.minimapPoints.map(point => withObservation({
        user_id: point.u ?? point.user_id ?? point.id,
        x: point.x,
        y: point.y,
        drop: point.d ?? point.drop,
        minimapOnly: true,
        observedAt: point.observedAt || point.lastSeenAt || 0
      }, 'minimap'))
    });
  }
  if (Array.isArray(context.persistedTargets)) lists.push({ source: 'persisted', items: context.persistedTargets });
  return lists;
}

function chaseCandidateDisplay(candidate) {
  if (!candidate) return null;
  return {
    id: candidate.id,
    user_id: candidate.user_id ?? candidate.id,
    name: candidate.name || '',
    hp: candidate.hp ?? null,
    drop: candidate.drop ?? null,
    latestDrop: candidate.latestDrop ?? null,
    x: finiteOrUndefined(candidate.x),
    y: finiteOrUndefined(candidate.y),
    distance: roundedOrNull(candidate.distance),
    source: candidate.source || '',
    sources: Array.isArray(candidate.sources) ? candidate.sources.slice(0, 4) : [],
    visible: Boolean(candidate.visible),
    attackableNow: Boolean(candidate.attackableNow),
    seekableNow: Boolean(candidate.seekableNow),
    stale: Boolean(candidate.stale),
    minimapOnly: Boolean(candidate.minimapOnly),
    snapshot: Boolean(candidate.snapshot),
    native: Boolean(candidate.native),
    render: Boolean(candidate.render),
    realtime: Boolean(candidate.realtime),
    invulnerable: Boolean(candidate.invulnerable),
    invulnerableRemainingMs: roundedOrNull(candidate.invulnerableRemainingMs),
    invulnerableRemainingTicks: roundedOrNull(candidate.invulnerableRemainingTicks),
    status: candidate.status || '',
    reason: candidate.reason || '',
    staminaBlocked: Boolean(candidate.staminaBlocked),
    staminaCost: roundedOrNull(candidate.staminaCost),
    staminaBudget: roundedOrNull(candidate.staminaBudget),
    marked: Boolean(candidate.marked),
    markedAt: Number(candidate.markedAt || 0) || 0
  };
}

function selectPanelCandidates(candidates, targets = [], options = {}) {
  const minDrop = Math.max(0, Number(options.minDrop ?? 10) || 10);
  const topDropLimit = Math.max(1, Math.round(Number(options.topDropLimit || 10) || 10));
  const nearestLimit = Math.max(1, Math.round(Number(options.nearestLimit || 10) || 10));
  const maxCandidates = Math.max(1, Math.round(Number(options.maxCandidates || 20) || 20));
  const targetIds = new Set((targets || []).map(item => String(item.id || '')).filter(Boolean));
  const eligible = (candidates || [])
    .filter(item => !item.whitelisted)
    .filter(item => item.life !== 'Dead' && item.life !== 'WaitingRevive')
    .filter(item => Number(item.drop ?? item.latestDrop ?? 0) >= minDrop || targetIds.has(String(item.id)));
  const byId = new Map();
  const add = item => {
    if (!item?.id || byId.has(String(item.id))) return;
    byId.set(String(item.id), item);
  };
  for (const item of eligible.filter(item => targetIds.has(String(item.id))).sort(comparePanelCandidate)) add(item);
  for (const item of eligible.slice().sort((a, b) => {
    const dropDiff = Number(b.drop ?? b.latestDrop ?? 0) - Number(a.drop ?? a.latestDrop ?? 0);
    if (dropDiff) return dropDiff;
    return Number(a.distance || Infinity) - Number(b.distance || Infinity);
  }).slice(0, topDropLimit)) add(item);
  for (const item of eligible.slice().sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity)).slice(0, nearestLimit)) add(item);
  return Array.from(byId.values()).sort(comparePanelCandidate).slice(0, maxCandidates);
}

function comparePanelCandidate(a, b) {
  if (Boolean(a.marked) !== Boolean(b.marked)) return a.marked ? -1 : 1;
  const dropDiff = Number(b.drop ?? b.latestDrop ?? 0) - Number(a.drop ?? a.latestDrop ?? 0);
  if (dropDiff) return dropDiff;
  const distanceDiff = Number(a.distance || Infinity) - Number(b.distance || Infinity);
  if (distanceDiff) return distanceDiff;
  return String(a.name || a.id).localeCompare(String(b.name || b.id));
}

function chaseLowDropClearDecision(candidate, previous = null, options = {}) {
  if (!candidate?.explicitFreshDropLow) return { clear: false, pending: false, observation: null };
  const visible = Boolean((candidate.visible || candidate.native || candidate.realtime || candidate.render) && !candidate.minimapOnly);
  if (!visible) return { clear: true, pending: false, observation: null };
  const nowMs = Number(options.nowMs || Date.now()) || Date.now();
  const graceMs = Math.max(0, Number(options.visibleGraceMs ?? 1500) || 0);
  const since = Number(previous?.since || nowMs) || nowMs;
  const observation = {
    id: String(candidate.id || ''),
    since,
    lastAt: nowMs,
    drop: chaseDropValue(candidate)
  };
  const clear = graceMs <= 0 || nowMs - since >= graceMs;
  return { clear, pending: !clear && graceMs > 0, observation };
}

function chaseKilledCandidateSuppressionDecision(candidate, suppression = null) {
  const killedAt = finiteNumber(suppression?.killedAt ?? suppression?.at);
  if (!candidate || killedAt === null || killedAt <= 0) return { suppress: false, release: false, killedAt: 0, observedAt: 0 };
  const observedAt = explicitObservedAtValue(candidate);
  if (observedAt > killedAt) return { suppress: false, release: true, killedAt, observedAt };
  return { suppress: true, release: false, killedAt, observedAt };
}

function filterChaseKilledCandidates(candidates, suppressions = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now()) || Date.now();
  const maxAgeMs = Math.max(1000, Number(options.maxAgeMs || 120000) || 120000);
  const nextSuppressions = suppressions && typeof suppressions === 'object' ? { ...suppressions } : {};
  for (const [id, item] of Object.entries(nextSuppressions)) {
    if (!item || nowMs - Number(item.killedAt || item.at || 0) > maxAgeMs) delete nextSuppressions[id];
  }
  const kept = [];
  for (const candidate of candidates || []) {
    const id = String(candidate?.id || '');
    const decision = chaseKilledCandidateSuppressionDecision(candidate, id ? nextSuppressions[id] : null);
    if (decision.release) delete nextSuppressions[id];
    if (!decision.suppress) kept.push(candidate);
  }
  return { candidates: kept, suppressions: nextSuppressions };
}

function decorateChaseTargets(state, candidates, options = {}) {
  const nowMs = Number(options.nowMs || Date.now()) || Date.now();
  const staleMs = Math.max(1000, Number(options.staleMs || 15000) || 15000);
  const byId = new Map((candidates || []).map(item => [String(item.id), item]));
  return (state.targets || []).map(target => {
    const candidate = byId.get(String(target.id));
    const lastSeenAt = Number(candidate?.observedAt || target.lastSeenAt || 0) || 0;
    const stale = !candidate || (lastSeenAt > 0 && nowMs - lastSeenAt > staleMs);
    return {
      ...target,
      ...(candidate || {}),
      id: target.id,
      user_id: candidate?.user_id ?? target.id,
      name: candidate?.name || target.name || '',
      drop: candidate?.drop ?? target.lastDrop ?? target.dropAtMark ?? null,
      latestDrop: candidate?.latestDrop ?? target.lastDrop ?? null,
      hp: candidate?.hp ?? target.lastHp ?? null,
      x: candidate?.x ?? target.lastX,
      y: candidate?.y ?? target.lastY,
      distance: Number.isFinite(Number(candidate?.distance)) ? Number(candidate.distance) : (Number.isFinite(Number(target.lastDistance)) ? Number(target.lastDistance) : Infinity),
      source: candidate?.source || target.lastSource || 'persisted',
      visible: Boolean(candidate?.visible),
      seekableNow: Boolean(candidate?.seekableNow),
      attackableNow: Boolean(candidate?.attackableNow),
      invulnerable: Boolean(candidate?.invulnerable),
      invulnerableRemainingMs: roundedOrNull(candidate?.invulnerableRemainingMs),
      invulnerableRemainingTicks: roundedOrNull(candidate?.invulnerableRemainingTicks),
      stale,
      marked: true,
      markedAt: target.markedAt || 0,
      lastSeenAt
    };
  });
}

function chooseChaseTarget(targets, previous = null, options = {}) {
  const stickMs = Math.max(0, Number(options.stickMs || 0) || 0);
  const nowMs = Number(options.nowMs || Date.now()) || Date.now();
  const actionable = (targets || [])
    .filter(item => item && !item.whitelisted)
    .filter(item => !item.staminaBlocked)
    .filter(item => item.seekableNow || item.attackableNow || item.visible)
    .filter(item => Number(item.drop ?? item.latestDrop ?? item.dropAtMark ?? 0) >= Math.max(0, Number(options.minDrop ?? 10) || 10))
    .sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity));
  if (!actionable.length) return null;
  const previousId = previous?.id ? String(previous.id) : '';
  const previousAt = Number(previous?.at || 0) || 0;
  if (previousId && stickMs > 0 && nowMs - previousAt <= stickMs) {
    const sticky = actionable.find(item => String(item.id) === previousId);
    if (sticky) return sticky;
  }
  return actionable[0] || null;
}

function chaseTargetPersistenceRecord(target, previous = {}, options = {}) {
  const nowMs = Number(options.nowMs || Date.now()) || Date.now();
  const id = chaseTargetId(target) || chaseTargetId(previous);
  if (!id) return null;
  const seen = target && target.source !== 'persisted';
  return {
    id,
    name: chaseTargetName(target) || previous.name || '',
    dropAtMark: previous.dropAtMark ?? chaseDropValue(target),
    lastDrop: chaseDropValue(target) ?? previous.lastDrop ?? previous.dropAtMark ?? null,
    lastHp: chaseHpValue(target) ?? previous.lastHp ?? null,
    lastX: finiteOrUndefined(target?.x ?? previous.lastX),
    lastY: finiteOrUndefined(target?.y ?? previous.lastY),
    lastDistance: roundedOrNull(target?.distance ?? previous.lastDistance),
    lastSeenAt: seen ? nowMs : (Number(previous.lastSeenAt || 0) || 0),
    lastSource: target?.source || previous.lastSource || 'persisted',
    markedAt: Number(previous.markedAt || options.markedAt || nowMs) || nowMs,
    markedBy: previous.markedBy || options.markedBy || 'panel'
  };
}

module.exports = {
  CHASE_MODE_STATE_VERSION,
  aggregateChaseCandidates,
  buildChaseSourceListsCore,
  chaseCandidateDisplay,
  chaseDropValue,
  chaseHpValue,
  chaseExplicitObservationForItem,
  chaseTargetId,
  chaseTargetName,
  chaseTargetPersistenceRecord,
  chaseLowDropClearDecision,
  chaseKilledCandidateSuppressionDecision,
  filterChaseKilledCandidates,
  chooseChaseTarget,
  decorateChaseTargets,
  normalizeChaseCandidate,
  normalizeChaseModeState,
  selectPanelCandidates
};
