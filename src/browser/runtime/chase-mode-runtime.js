'use strict';

const {
  aggregateChaseCandidates,
  chaseCandidateDisplay,
  chaseDropValue,
  chaseTargetId,
  chaseTargetName,
  chaseTargetPersistenceRecord,
  chooseChaseTarget,
  decorateChaseTargets,
  normalizeChaseCandidate,
  normalizeChaseModeState,
  selectPanelCandidates
} = require('../../strategy/chase-mode');

function createChaseModeRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    storageKey = 'graspRatChaseModeTargets',
    now = () => Date.now(),
    dist = () => Infinity,
    directionTo = null,
    getSelf = () => null,
    getNativeEntityList = () => [],
    isAlive = value => Boolean(value),
    isWhitelistedTarget = () => false,
    isInvulnerable = () => false,
    dropValue = value => Number(value?.drop || 0) || 0,
    combatHpValue = value => Number(value?.hp ?? 100),
    knownHpValue = value => Number.isFinite(Number(value?.hp)) ? Number(value.hp) : null,
    opportunityLongStaminaBudget = () => Infinity,
    opportunityEnemyStaminaCost = () => Infinity,
    buildCombatAction = () => null
  } = runtime;

  function minDrop() {
    return Math.max(0, Number(cfg.chaseMinDrop ?? 10) || 10);
  }

  function persistMax() {
    return Math.max(1, Math.round(Number(cfg.chaseTargetPersistMax || 20) || 20));
  }

  function ensureChaseModeState() {
    bot.chaseMode = {
      ...normalizeChaseModeState(bot.chaseMode, { persistMax: persistMax() }),
      lastClear: bot.chaseMode?.lastClear || null,
      lastDecision: bot.chaseMode?.lastDecision || null,
      selectedTargetId: String(bot.chaseMode?.selectedTargetId || ''),
      selectedTargetAt: Number(bot.chaseMode?.selectedTargetAt || 0) || 0,
      panelCandidates: Array.isArray(bot.chaseMode?.panelCandidates) ? bot.chaseMode.panelCandidates : [],
      selectedTarget: bot.chaseMode?.selectedTarget || null
    };
    return bot.chaseMode;
  }

  function readStoredChaseModeState() {
    if (!storage) return normalizeChaseModeState(null, { persistMax: persistMax() });
    try {
      return normalizeChaseModeState(JSON.parse(String(storage.getItem(storageKey) || 'null')), {
        persistMax: persistMax()
      });
    } catch (_) {
      return normalizeChaseModeState(null, { persistMax: persistMax() });
    }
  }

  function writeChaseModeState(reason = '') {
    const state = ensureChaseModeState();
    state.updatedAt = now();
    const stored = normalizeChaseModeState(state, { persistMax: persistMax() });
    state.version = stored.version;
    state.targets = stored.targets;
    state.updatedAt = stored.updatedAt;
    if (storage) {
      try {
        storage.setItem(storageKey, JSON.stringify(stored));
      } catch (err) {
        state.lastPersistError = err?.message || String(err);
        state.lastPersistErrorAt = now();
      }
    }
    state.lastPersistReason = String(reason || '');
    return stored;
  }

  function restoreChaseModeState() {
    const restored = readStoredChaseModeState();
    const state = ensureChaseModeState();
    if (!state.targets.length && restored.targets.length) {
      state.targets = restored.targets;
      state.updatedAt = restored.updatedAt;
    }
    return ensureChaseModeState();
  }

  function targetIsSelf(target) {
    const self = getSelf();
    const selfId = self?.user_id ?? self?.id;
    const id = target?.id ?? target?.user_id ?? target?.userId;
    return selfId !== undefined && selfId !== null && id !== undefined && id !== null && String(selfId) === String(id);
  }

  function setChaseTarget(target, options = {}) {
    const state = ensureChaseModeState();
    const t = now();
    const normalized = normalizeChaseCandidate(target, {
      self: getSelf(),
      dist,
      source: target?.source || options.source || 'panel',
      nowMs: t
    });
    if (!normalized?.id) return { ok: false, reason: 'target-id-required' };
    if (targetIsSelf(normalized)) return { ok: false, reason: 'target-is-self' };
    if (isWhitelistedTarget(normalized)) return { ok: false, reason: 'target-whitelisted' };
    const drop = chaseDropValue(normalized);
    if (drop === null || drop < minDrop()) return { ok: false, reason: 'target-drop-too-low', minDrop: minDrop(), drop };
    const previous = state.targets.find(item => String(item.id) === String(normalized.id)) || {};
    const record = chaseTargetPersistenceRecord({ ...normalized, drop }, previous, {
      nowMs: t,
      markedAt: previous.markedAt || t,
      markedBy: options.markedBy || 'panel'
    });
    state.targets = [
      record,
      ...state.targets.filter(item => String(item.id) !== String(record.id))
    ].slice(0, persistMax());
    state.lastClear = state.lastClear || null;
    writeChaseModeState('set');
    return { ok: true, target: record, status: summarizeChaseModeStatus(getSelf()) };
  }

  function clearChaseTarget(id, reason = 'manual') {
    const state = ensureChaseModeState();
    const key = id === undefined || id === null ? '' : String(id);
    if (!key) return { ok: false, reason: 'target-id-required' };
    const before = state.targets.length;
    state.targets = state.targets.filter(item => String(item.id) !== key);
    const cleared = before !== state.targets.length;
    if (cleared) {
      state.lastClear = { at: now(), id: key, reason: String(reason || 'manual') };
      if (String(state.selectedTargetId || '') === key) {
        state.selectedTargetId = '';
        state.selectedTargetAt = 0;
        state.selectedTarget = null;
      }
      writeChaseModeState('clear:' + reason);
    }
    return { ok: true, cleared, id: key, status: summarizeChaseModeStatus(getSelf()) };
  }

  function clearAllChaseTargets(reason = 'manual') {
    const state = ensureChaseModeState();
    const count = state.targets.length;
    state.targets = [];
    state.selectedTargetId = '';
    state.selectedTargetAt = 0;
    state.selectedTarget = null;
    state.panelCandidates = [];
    state.lastClear = { at: now(), id: '', reason: String(reason || 'manual'), count };
    writeChaseModeState('clear-all:' + reason);
    return { ok: true, cleared: count, status: summarizeChaseModeStatus(getSelf()) };
  }

  function sourceFresh(source, observedAt, t) {
    const ageMs = observedAt ? Math.max(0, t - Number(observedAt || 0)) : Infinity;
    const maxAge = source === 'minimap'
      ? Math.max(1000, Number(cfg.chaseMinimapMaxAgeMs || 15000) || 15000)
      : Math.max(1000, Number(cfg.chaseSnapshotMaxAgeMs || 15000) || 15000);
    if (source === 'persisted') return false;
    return ageMs <= maxAge;
  }

  function sourceListsFromRuntime(self, context = {}) {
    const lists = [];
    if (Array.isArray(context.realtimeEntities)) lists.push({ source: 'native', items: context.realtimeEntities });
    else {
      const nativeEntities = getNativeEntityList();
      if (Array.isArray(nativeEntities)) lists.push({ source: 'native', items: nativeEntities });
    }
    if (Array.isArray(context.entities)) {
      lists.push({
        source: 'snapshot',
        items: context.entities
          .filter(item => item?.snapshot || item?.global || !item?.native)
          .map(item => ({ ...item, observedAt: item.observedAt || bot.globalState?.snapshotRefreshedAt || 0 }))
      });
    } else if (Array.isArray(bot.globalState?.entities)) {
      lists.push({
        source: 'snapshot',
        items: bot.globalState.entities.map(item => ({ ...item, observedAt: item.observedAt || bot.globalState?.snapshotRefreshedAt || 0 }))
      });
    }
    if (Array.isArray(context.globalTargets)) {
      lists.push({
        source: 'snapshot',
        items: context.globalTargets.map(item => ({ ...item, observedAt: item.observedAt || bot.globalState?.snapshotRefreshedAt || 0 }))
      });
    }
    if (Array.isArray(context.minimapDropTargets)) {
      lists.push({
        source: 'minimap',
        items: context.minimapDropTargets.map(item => ({ ...item, observedAt: item.observedAt || bot.globalState?.snapshotRefreshedAt || 0 }))
      });
    }
    else if (Array.isArray(bot.globalState?.minimap?.points)) {
      lists.push({
        source: 'minimap',
        items: bot.globalState.minimap.points.map(point => ({
          user_id: point.u ?? point.user_id ?? point.id,
          x: point.x,
          y: point.y,
          drop: point.d ?? point.drop,
          minimapOnly: true,
          observedAt: bot.globalState.snapshotRefreshedAt || now()
        }))
      });
    }
    if (Array.isArray(context.persistedTargets)) lists.push({ source: 'persisted', items: context.persistedTargets });
    return lists;
  }

  function candidateDecorators(self, context = {}) {
    const combatById = new Map((context.combatTargets || []).map(item => [String(item.user_id ?? item.id ?? ''), item]));
    const attackRange = Math.max(0, Number(cfg.combatAttackRange || cfg.attackRange || 0));
    const budget = opportunityLongStaminaBudget(self);
    const t = Number(context.nowMs || now()) || now();
    return candidate => {
      const id = String(candidate.id || '');
      const combatTarget = combatById.get(id) || null;
      const drop = candidate.drop ?? dropValue(candidate);
      const hp = candidate.hp ?? knownHpValue(candidate) ?? combatHpValue(candidate);
      const whitelisted = isWhitelistedTarget(candidate);
      const invulnerable = isInvulnerable(candidate);
      const explicitFreshDropLow = candidate.latestDrop !== null
        && candidate.latestDrop !== undefined
        && Number(candidate.latestDrop) < minDrop()
        && sourceFresh(candidate.source, candidate.observedAt, t);
      const travelCost = Math.max(0, Number(candidate.distance || 0) || 0) * Math.max(0, Number(cfg.opportunityMoveStaminaPerCm ?? 1) || 1);
      const killCost = Number(opportunityEnemyStaminaCost({ ...candidate, drop, hp, distance: candidate.distance }));
      const staminaCost = travelCost + (Number.isFinite(killCost) ? Math.max(0, killCost) : Math.max(0, Number(cfg.chaseKillStaminaBudgetMs || 100000) || 100000));
      const staminaBlocked = Number.isFinite(budget) && staminaCost > budget;
      const attackableNow = Boolean(
        combatTarget
        && candidate.visible
        && !candidate.minimapOnly
        && !whitelisted
        && !invulnerable
        && Number(candidate.distance || Infinity) <= attackRange
      );
      return {
        ...candidate,
        drop,
        hp,
        whitelisted,
        invulnerable,
        explicitFreshDropLow,
        attackableNow,
        seekableNow: Boolean(candidate.seekableNow && !whitelisted && !invulnerable && !explicitFreshDropLow),
        staminaBlocked,
        staminaCost,
        staminaBudget: budget,
        combatTarget
      };
    };
  }

  function recentKillMatchesTarget(target, t = now()) {
    const id = String(target?.id || '');
    const name = chaseTargetName(target);
    const maxAge = Math.max(1000, Number(cfg.killAttributionMergeMs || 120000) || 120000);
    return (bot.killHistory || []).some(item => {
      if (t - Number(item?.at || 0) > maxAge) return false;
      const itemId = item?.id ?? item?.targetId;
      if (id && itemId !== undefined && itemId !== null && String(itemId) === id) return true;
      const itemName = chaseTargetName({ name: item?.victim || item?.name });
      return Boolean(name && itemName && name === itemName);
    });
  }

  function applyAutomaticClear(decoratedTargets, candidates, t) {
    const state = ensureChaseModeState();
    const candidateById = new Map((candidates || []).map(item => [String(item.id), item]));
    const clearIntents = [];
    for (const target of decoratedTargets || []) {
      const candidate = candidateById.get(String(target.id));
      if (target.whitelisted || (candidate && isWhitelistedTarget(candidate))) {
        clearIntents.push({ id: target.id, reason: 'target-whitelisted' });
        continue;
      }
      if (candidate?.explicitFreshDropLow) {
        clearIntents.push({ id: target.id, reason: 'drop-below-min', drop: candidate.latestDrop });
        continue;
      }
      if (recentKillMatchesTarget(target, t)) {
        clearIntents.push({ id: target.id, reason: 'target-killed' });
      }
    }
    if (!clearIntents.length) return clearIntents;
    const clearIds = new Set(clearIntents.map(item => String(item.id)));
    state.targets = state.targets.filter(item => !clearIds.has(String(item.id)));
    state.lastClear = { at: t, ...clearIntents[clearIntents.length - 1], count: clearIntents.length };
    if (clearIds.has(String(state.selectedTargetId || ''))) {
      state.selectedTargetId = '';
      state.selectedTargetAt = 0;
      state.selectedTarget = null;
    }
    writeChaseModeState('auto-clear');
    return clearIntents;
  }

  function updatePersistedTargetObservations(decoratedTargets) {
    const state = ensureChaseModeState();
    let changed = false;
    const byId = new Map((decoratedTargets || []).map(item => [String(item.id), item]));
    state.targets = state.targets.map(target => {
      const current = byId.get(String(target.id));
      if (!current || current.source === 'persisted') return target;
      changed = true;
      return chaseTargetPersistenceRecord(current, target, { nowMs: now() }) || target;
    });
    if (changed) writeChaseModeState('observe');
  }

  function summarizeChaseModeStatus(self = getSelf(), context = {}) {
    const state = restoreChaseModeState();
    const t = Number(context.nowMs || now()) || now();
    const sources = sourceListsFromRuntime(self, {
      ...context,
      persistedTargets: state.targets.map(item => ({
        id: item.id,
        user_id: item.id,
        name: item.name,
        drop: item.lastDrop ?? item.dropAtMark,
        hp: item.lastHp,
        x: item.lastX,
        y: item.lastY,
        distance: item.lastDistance,
        source: 'persisted',
        lastSeenAt: item.lastSeenAt
      }))
    });
    const rawCandidates = aggregateChaseCandidates(sources, { self, dist, nowMs: t });
    const decoratedCandidates = rawCandidates
      .filter(item => {
        const id = item?.id;
        if (!id && id !== 0) return false;
        const selfId = self?.user_id ?? self?.id;
        return selfId === undefined || selfId === null || String(id) !== String(selfId);
      })
      .filter(item => isAlive(item))
      .map(candidateDecorators(self, { ...context, nowMs: t }));
    let targets = decorateChaseTargets(state, decoratedCandidates, {
      nowMs: t,
      staleMs: Math.max(Number(cfg.chaseSnapshotMaxAgeMs || 15000), Number(cfg.chaseMinimapMaxAgeMs || 15000), 15000)
    }).map(candidateDecorators(self, { ...context, nowMs: t }));
    const clearIntents = applyAutomaticClear(targets, decoratedCandidates, t);
    if (clearIntents.length) {
      targets = decorateChaseTargets(state, decoratedCandidates, { nowMs: t }).map(candidateDecorators(self, { ...context, nowMs: t }));
    }
    updatePersistedTargetObservations(targets);
    const targetIds = new Set(state.targets.map(item => String(item.id)));
    const panelCandidates = selectPanelCandidates(
      decoratedCandidates.map(item => ({
        ...item,
        marked: targetIds.has(String(item.id)),
        markedAt: state.targets.find(target => String(target.id) === String(item.id))?.markedAt || 0,
        status: item.whitelisted
          ? '白名单'
          : (item.staminaBlocked ? '体力不足' : (item.attackableNow ? '射程内' : (item.visible ? '视野' : (item.minimapOnly ? 'minimap' : (item.snapshot ? '快照' : '未刷新')))))
      })),
      state.targets,
      {
        minDrop: minDrop(),
        topDropLimit: cfg.chasePanelTopDropLimit,
        nearestLimit: cfg.chasePanelNearestLimit,
        maxCandidates: cfg.chasePanelMaxCandidates
      }
    ).map(chaseCandidateDisplay);
    const selected = chooseChaseTarget(targets, {
      id: state.selectedTargetId,
      at: state.selectedTargetAt
    }, {
      nowMs: t,
      stickMs: cfg.chaseTargetStickMs,
      minDrop: minDrop()
    });
    state.panelCandidates = panelCandidates;
    state.selectedTarget = selected ? chaseCandidateDisplay(selected) : null;
    if (selected) {
      state.selectedTargetId = String(selected.id);
      state.selectedTargetAt = t;
    }
    state.lastDecision = {
      at: t,
      selectedTarget: state.selectedTarget,
      clearIntents,
      activeCount: state.targets.length,
      candidateCount: panelCandidates.length
    };
    return {
      enabled: true,
      minDrop: minDrop(),
      activeCount: state.targets.length,
      candidateCount: panelCandidates.length,
      panelCandidates,
      targets: targets.map(chaseCandidateDisplay),
      selectedTarget: state.selectedTarget,
      lastClear: state.lastClear || null,
      lastDecision: state.lastDecision || null
    };
  }

  function buildDirection(self, target) {
    if (typeof directionTo === 'function') return directionTo(self, target);
    const distance = dist(self, target);
    if (!Number.isFinite(distance) || distance <= 0) return { dx: 0, dy: 0, distance };
    return {
      dx: Math.sign(Number(target.x) - Number(self.x)),
      dy: Math.sign(Number(target.y) - Number(self.y)),
      distance
    };
  }

  function selectChaseModeAction(self, context = {}) {
    const status = summarizeChaseModeStatus(self, context);
    const selected = status.selectedTarget;
    if (!selected) return null;
    const targetId = String(selected.id || '');
    const combatTarget = (context.combatTargets || []).find(item => String(item.user_id ?? item.id ?? '') === targetId) || null;
    if (combatTarget && selected.visible && selected.attackableNow) {
      const chaseCombatTarget = {
        ...combatTarget,
        chaseMode: true,
        combatIntent: 'profit',
        combatOriginReason: 'chase-mode-combat'
      };
      const action = buildCombatAction(self, chaseCombatTarget, context.bullets || []);
      if (action) {
        if (action.kind === 'leave') return action;
        return {
          ...action,
          chaseMode: {
            targetId,
            name: selected.name || '',
            drop: selected.drop,
            source: selected.source,
            reason: 'chase-mode-combat'
          },
          target: action.target ? {
            ...action.target,
            chaseMode: true,
            combatIntent: action.target.combatIntent || 'profit'
          } : action.target,
          opportunityChoice: {
            type: 'chase-target',
            id: targetId,
            score: Number(action.score || selected.drop * 1000000 || 0),
            staminaCost: selected.staminaCost,
            priorityTier: 0
          }
        };
      }
    }
    if (!selected.seekableNow || selected.staminaBlocked || selected.x === undefined || selected.y === undefined) return null;
    const dir = buildDirection(self, selected);
    return {
      kind: 'seek-enemy',
      reason: 'chase-mode-approach',
      chaseMode: {
        targetId,
        name: selected.name || '',
        drop: selected.drop,
        source: selected.source,
        reason: 'chase-mode-approach'
      },
      target: {
        id: targetId,
        name: selected.name || '',
        x: selected.x,
        y: selected.y,
        drop: selected.drop,
        hp: selected.hp,
        distance: Math.round(Number(dir.distance || selected.distance || 0)),
        source: selected.source,
        visible: Boolean(selected.visible),
        minimapOnly: Boolean(selected.minimapOnly),
        chaseMode: true
      },
      dx: dir.dx,
      dy: dir.dy,
      shoot: false,
      rememberAttack: false,
      score: Math.round(Number(selected.drop || 0) * 1000000 - Number(dir.distance || selected.distance || 0)),
      staminaCost: Math.round(Number(selected.staminaCost || 0)),
      opportunityChoice: {
        type: 'chase-target',
        id: targetId,
        score: Math.round(Number(selected.drop || 0) * 1000000 - Number(dir.distance || selected.distance || 0)),
        staminaCost: Math.round(Number(selected.staminaCost || 0)),
        priorityTier: 0
      }
    };
  }

  restoreChaseModeState();

  return {
    readStoredChaseModeState,
    restoreChaseModeState,
    writeChaseModeState,
    setChaseTarget,
    clearChaseTarget,
    clearAllChaseTargets,
    summarizeChaseModeStatus,
    selectChaseModeAction
  };
}

module.exports = {
  createChaseModeRuntime
};
