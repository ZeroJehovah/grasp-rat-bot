'use strict';

function createLoginPointSafetyRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    loginPointSafetyKey = '',
    loginSuppressKey = '',
    loginSuppressReasonKey = '',
    getCurrentUserId = () => 0,
    dropValue = () => 0,
    truthyFlag = value => Boolean(value),
    staminaRemaining = () => null,
    staminaLimitValue = (_entity, _windowName, fallback) => fallback,
    isJoinModeActive = () => false,
    isFiringEntity = () => false,
    isMovingThreat = () => false,
    isAlive = value => Boolean(value),
    isInvulnerable = () => false
  } = runtime;
  const localStorage = storage;
  const LOGIN_POINT_SAFETY_KEY = loginPointSafetyKey;
  const LOGIN_SUPPRESS_KEY = loginSuppressKey;
  const LOGIN_SUPPRESS_REASON_KEY = loginSuppressReasonKey;

    function loginPointSafetySuccessRequired() {
      return Math.max(0, Math.round(Number(cfg.loginPointSafetySuccessRequired ?? 3) || 3));
    }

    function optionalFiniteNumber(value) {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    function loginPointSafetyLastExitHp(state = null) {
      return optionalFiniteNumber(
        state?.lastExitSelfHp
          ?? state?.lastExitHp
          ?? state?.lastExitSelf?.hp
          ?? state?.lastExitSelf?.selfHp
      );
    }

    function loginPointSafetyHealthyHpThreshold() {
      return Math.max(0, Number(cfg.loginPointSafetyHealthyHpThreshold ?? 80) || 80);
    }

    function loginPointSafetyLowHpRadius() {
      return Math.max(0, Number(cfg.loginPointSafetyRadius ?? 30000) || 30000);
    }

    function loginPointSafetyHealthyRadius() {
      return Math.max(0, Number(cfg.loginPointSafetyHealthyRadius ?? 17000) || 17000);
    }

    function loginPointSafetyRadiusInfo(state = null) {
      const lastExitSelfHp = loginPointSafetyLastExitHp(state);
      const healthyHpThreshold = loginPointSafetyHealthyHpThreshold();
      const lowHpRadius = loginPointSafetyLowHpRadius();
      const healthyRadius = loginPointSafetyHealthyRadius();
      const healthyExit = Number.isFinite(lastExitSelfHp) && lastExitSelfHp >= healthyHpThreshold;
      return {
        radius: healthyExit ? healthyRadius : lowHpRadius,
        lowHpRadius,
        healthyRadius,
        healthyHpThreshold,
        lastExitSelfHp: Number.isFinite(lastExitSelfHp) ? lastExitSelfHp : null,
        lastExitSelfHpKnown: Number.isFinite(lastExitSelfHp),
        radiusReason: healthyExit ? 'last-exit-hp-healthy' : 'last-exit-hp-low-or-unknown'
      };
    }

    function loginPointSafetyRadius(state = null) {
      return loginPointSafetyRadiusInfo(state).radius;
    }

    function loginPointSafetyDayKey(t = Date.now()) {
      const d = new Date(t);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }

    function finiteNumber(...values) {
      for (const value of values) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      return NaN;
    }

    function loginPointSafetyExitSelfHpFrom(...values) {
      for (const value of values) {
        if (value === undefined || value === null) continue;
        if (typeof value === 'object') {
          const nested = loginPointSafetyExitSelfHpFrom(
            value.hp,
            value.selfHp,
            value.currentHp,
            value.self?.hp,
            value.self?.selfHp,
            value.summary?.hp,
            value.detail?.self?.hp
          );
          if (Number.isFinite(nested)) return nested;
          continue;
        }
        const n = optionalFiniteNumber(value);
        if (Number.isFinite(n)) return n;
      }
      return NaN;
    }

    function loginPointSafetyExitSelfForDetail(detail = null, meta = null, fallback = null) {
      return meta?.self
        || detail?.self
        || detail?.injury?.self
        || detail?.injury
        || detail?.combat?.self
        || detail?.offlineSafety?.self
        || fallback
        || null;
    }

    function loginPointEntityKey(entity) {
      const id = entity?.user_id ?? entity?.userId ?? entity?.id;
      if (id !== undefined && id !== null && id !== '') return 'id:' + String(id);
      const name = String(entity?.name || '').trim();
      return name ? 'name:' + name : '';
    }

    function loginPointActorSummary(entity, extra = {}) {
      if (!entity || typeof entity !== 'object') return null;
      const key = loginPointEntityKey(entity);
      if (!key) return null;
      const rawId = entity.user_id ?? entity.userId ?? entity.id;
      return {
        key,
        id: rawId === undefined || rawId === null || rawId === '' ? '' : String(rawId),
        name: String(entity.name || ''),
        x: Number.isFinite(Number(entity.x)) ? Math.round(Number(entity.x)) : null,
        y: Number.isFinite(Number(entity.y)) ? Math.round(Number(entity.y)) : null,
        drop: Math.max(0, Math.round(dropValue(entity))),
        mode: String(entity.current_join_mode || entity.mode || ''),
        ...extra
      };
    }

    function normalizeLoginPointSafetyState(state = null, t = Date.now()) {
      const source = state && typeof state === 'object' ? state : {};
      const required = loginPointSafetySuccessRequired();
      const point = source.point && Number.isFinite(Number(source.point.x)) && Number.isFinite(Number(source.point.y))
        ? {
          x: Number(source.point.x),
          y: Number(source.point.y),
          userId: source.point.userId ?? source.point.id ?? null,
          at: Number(source.point.at || 0) || 0,
          tick: Number(source.point.tick || 0) || 0,
          loginAt: Number(source.point.loginAt || 0) || 0,
          source: String(source.point.source || '')
        }
        : null;
      const dayKey = loginPointSafetyDayKey(t);
      const damagedBy = source.damagedBy && source.damagedBy.dayKey === dayKey
        ? {
          dayKey,
          actors: Array.isArray(source.damagedBy.actors)
            ? source.damagedBy.actors.filter(actor => actor && actor.key).slice(-80)
            : []
        }
        : { dayKey, actors: [] };
      const movement = source.movement && typeof source.movement === 'object' ? { ...source.movement } : {};
      const lastExitSelfHp = loginPointSafetyLastExitHp(source);
      const radiusInfo = loginPointSafetyRadiusInfo({ lastExitSelfHp });
      return {
        point,
        streak: Math.max(0, Math.round(Number(source.streak || 0) || 0)),
        required,
        radius: radiusInfo.radius,
        lowHpRadius: radiusInfo.lowHpRadius,
        healthyRadius: radiusInfo.healthyRadius,
        healthyHpThreshold: radiusInfo.healthyHpThreshold,
        radiusReason: radiusInfo.radiusReason,
        lastExitSelfHp: Number.isFinite(lastExitSelfHp) ? lastExitSelfHp : null,
        lastExitSelfHpKnown: Number.isFinite(lastExitSelfHp),
        lastExitSelfHpAt: Number(source.lastExitSelfHpAt || source.lastExitHpAt || 0) || 0,
        lastExitSelfHpReason: String(source.lastExitSelfHpReason || source.lastExitHpReason || ''),
        lastSampleAt: Number(source.lastSampleAt || source.lastOkAt || source.lastUnsafeAt || source.lastErrorAt || 0) || 0,
        lastOkAt: Number(source.lastOkAt || 0) || 0,
        lastUnsafeAt: Number(source.lastUnsafeAt || 0) || 0,
        lastErrorAt: Number(source.lastErrorAt || 0) || 0,
        lastError: String(source.lastError || ''),
        lastTick: Number(source.lastTick || 0) || 0,
        resetAt: Number(source.resetAt || 0) || 0,
        resetReason: String(source.resetReason || ''),
        lastDanger: source.lastDanger && typeof source.lastDanger === 'object' ? { ...source.lastDanger } : null,
        movement,
        damagedBy
      };
    }

    function loginPointHasPoint(state) {
      return Boolean(
        state?.point
          && Number.isFinite(Number(state.point.x))
          && Number.isFinite(Number(state.point.y))
      );
    }

    function loginPointPointStamp(state) {
      if (!loginPointHasPoint(state)) return 0;
      return Math.max(Number(state.point.at || 0) || 0, Number(state.point.loginAt || 0) || 0);
    }

    function mergeLoginPointSafetyState(memoryState, storedState, t = Date.now()) {
      const memory = memoryState && typeof memoryState === 'object'
        ? normalizeLoginPointSafetyState(memoryState, t)
        : null;
      const stored = storedState && typeof storedState === 'object'
        ? normalizeLoginPointSafetyState(storedState, t)
        : null;
      if (!memory) return stored || normalizeLoginPointSafetyState(null, t);
      if (!stored) return memory;
      const memoryHasPoint = loginPointHasPoint(memory);
      const storedHasPoint = loginPointHasPoint(stored);
      if (storedHasPoint && (!memoryHasPoint || loginPointPointStamp(stored) > loginPointPointStamp(memory))) {
        return stored;
      }
      if (Number(stored.lastExitSelfHpAt || 0) > Number(memory.lastExitSelfHpAt || 0)) {
        return normalizeLoginPointSafetyState({
          ...memory,
          lastExitSelfHp: stored.lastExitSelfHp,
          lastExitSelfHpKnown: stored.lastExitSelfHpKnown,
          lastExitSelfHpAt: stored.lastExitSelfHpAt,
          lastExitSelfHpReason: stored.lastExitSelfHpReason
        }, t);
      }
      return memory;
    }

    function readLoginPointSafetyState(t = Date.now()) {
      let stored = null;
      try {
        stored = JSON.parse(localStorage.getItem(LOGIN_POINT_SAFETY_KEY) || 'null');
      } catch (_) {
        stored = null;
      }
      const state = mergeLoginPointSafetyState(bot.loginPointSafety, stored, t);
      bot.loginPointSafety = state;
      return state;
    }

    function writeLoginPointSafetyState(state) {
      bot.loginPointSafety = state;
      try {
        localStorage.setItem(LOGIN_POINT_SAFETY_KEY, JSON.stringify(state));
      } catch (_) {}
      return state;
    }

    function loginPointDamageActorKeys(state) {
      return new Set((state?.damagedBy?.actors || []).map(actor => String(actor.key || '')).filter(Boolean));
    }

    function loginPointDamageEvidence(candidate, injury = {}) {
      if (!candidate || typeof candidate !== 'object') return '';
      const rawId = candidate.user_id ?? candidate.userId ?? candidate.id;
      const incomingOwnerId = injury?.incomingBullet?.ownerId
        ?? injury?.incomingBullet?.owner_id
        ?? candidate.incomingBulletOwnerId
        ?? candidate.damageEvidence?.incomingBulletOwnerId
        ?? null;
      if (incomingOwnerId !== null && incomingOwnerId !== undefined && rawId !== undefined && rawId !== null && String(incomingOwnerId) === String(rawId)) {
        return 'incoming-bullet-owner';
      }
      if (truthyFlag(candidate.firing)
        || truthyFlag(candidate.isFiring)
        || truthyFlag(candidate.shooting)
        || truthyFlag(candidate.damageEvidence?.firing)) {
        return 'firing-near-self-hp-drop';
      }
      if (truthyFlag(candidate.combat)
        || truthyFlag(candidate.engagedCombat)
        || truthyFlag(candidate.damageEvidence?.combat)
        || String(candidate.combatIntent || candidate.damageEvidence?.combatIntent || '') === 'engaged') {
        return 'combat-engaged-self-hp-drop';
      }
      return '';
    }

    function loginPointEntityMoved(state, entity, t) {
      const key = loginPointEntityKey(entity);
      if (!key) return false;
      const x = Number(entity.x);
      const y = Number(entity.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const threshold = Math.max(0, Number(cfg.loginPointSafetyMoveThreshold ?? 500) || 500);
      const previous = state.movement?.[key] || null;
      let moved = false;
      if (previous && Number.isFinite(Number(previous.x)) && Number.isFinite(Number(previous.y))) {
        moved = Math.hypot(x - Number(previous.x), y - Number(previous.y)) >= threshold;
      }
      if (!state.movement || typeof state.movement !== 'object') state.movement = {};
      state.movement[key] = {
        x,
        y,
        at: t,
        movedAt: moved ? t : Number(previous?.movedAt || 0) || 0
      };
      const entries = Object.entries(state.movement)
        .filter(([, item]) => t - Number(item?.at || 0) <= 10 * 60 * 1000)
        .slice(-300);
      state.movement = Object.fromEntries(entries);
      return moved || Boolean(state.movement[key].movedAt && t - Number(state.movement[key].movedAt || 0) <= 10 * 60 * 1000);
    }

    function loginPointActiveModeStaminaSpent(entity) {
      const remaining = staminaRemaining(entity, '5s');
      if (remaining === null) return false;
      const limit = staminaLimitValue(entity, '5s', 10000);
      return Number.isFinite(limit) && limit > 0 && remaining < limit * cfg.staminaFullRatio;
    }

    function loginPointActiveModeDangerReason(state, entity, t) {
      if (!isJoinModeActive(entity)) return '';
      const moved = loginPointEntityMoved(state, entity, t);
      if (isFiringEntity(entity)) return 'active-mode-firing';
      if (isMovingThreat(entity) || moved) return 'active-mode-moving';
      if (loginPointActiveModeStaminaSpent(entity)) return 'active-mode-stamina-spent';
      if (truthyFlag(entity.combat)
        || truthyFlag(entity.engagedCombat)
        || String(entity.combatIntent || '') === 'engaged') {
        return 'active-mode-combat';
      }
      return '';
    }

    function loginPointDangerReason(state, entity, t) {
      if (!entity || typeof entity !== 'object') return '';
      const damagedKeys = loginPointDamageActorKeys(state);
      const key = loginPointEntityKey(entity);
      if (key && damagedKeys.has(key)) return 'damaged-self-today';
      const activeModeReason = loginPointActiveModeDangerReason(state, entity, t);
      if (activeModeReason) return activeModeReason;
      return '';
    }

    function evaluateLoginPointSafety(state, detail = {}, t = Date.now()) {
      if (!state.point) return { safe: true, reason: 'no-login-point', danger: null };
      const entities = Array.isArray(detail.entities) ? detail.entities : bot.globalState.entities;
      if (!Array.isArray(entities)) {
        return { safe: false, reason: 'snapshot-entities-missing', danger: null };
      }
      const point = state.point;
      const radius = loginPointSafetyRadius(state);
      for (const entity of entities) {
        if (!entity || typeof entity !== 'object') continue;
        if (!isAlive(entity) || isInvulnerable(entity)) continue;
        const id = Number(entity.user_id ?? entity.userId ?? entity.id ?? NaN);
        if (Number.isFinite(id) && Number(point.userId ?? NaN) === id) continue;
        const x = Number(entity.x);
        const y = Number(entity.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const distance = Math.hypot(x - Number(point.x), y - Number(point.y));
        if (!(distance <= radius)) continue;
        const reason = loginPointDangerReason(state, entity, t);
        if (!reason) continue;
        return {
          safe: false,
          reason,
          danger: loginPointActorSummary(entity, {
            distance: Math.round(distance)
          })
        };
      }
      return { safe: true, reason: 'safe', danger: null };
    }

    function noteLoginPointSafetyProbe(success, detail = {}) {
      const t = Date.now();
      const state = readLoginPointSafetyState(t);
      state.required = loginPointSafetySuccessRequired();
      state.radius = loginPointSafetyRadius(state);
      state.lastSampleAt = t;
      state.lastTick = Number(detail.tick || state.lastTick || 0) || 0;
      if (!loginPointHasPoint(state)) {
        state.streak = 0;
        state.lastDanger = null;
        if (success) {
          state.lastOkAt = 0;
          state.lastError = '';
        } else {
          state.lastErrorAt = t;
          state.lastError = String(detail.error || detail.message || 'snapshot failed');
        }
        writeLoginPointSafetyState(state);
        return loginPointSafetyStatus(t);
      }
      let ok = Boolean(success);
      let safety = { safe: ok, reason: ok ? 'safe' : 'snapshot-error', danger: null };
      if (ok) {
        safety = evaluateLoginPointSafety(state, detail, t);
        ok = Boolean(safety.safe);
      }
      if (ok) {
        state.streak = Math.min(state.required, Math.max(0, Number(state.streak || 0)) + 1);
        state.lastOkAt = t;
        state.lastError = '';
        state.lastDanger = null;
      } else {
        state.streak = 0;
        if (success) {
          state.lastUnsafeAt = t;
          state.lastDanger = {
            reason: safety.reason || 'unsafe',
            actor: safety.danger || null,
            at: t
          };
          state.lastError = '';
        } else {
          state.lastErrorAt = t;
          state.lastError = String(detail.error || detail.message || 'snapshot failed');
          state.lastDanger = null;
        }
      }
      writeLoginPointSafetyState(state);
      return loginPointSafetyStatus(t);
    }

    function loginPointSafetyStatus(t = Date.now()) {
      const state = readLoginPointSafetyState(t);
      const required = loginPointSafetySuccessRequired();
      const hasPoint = Boolean(state.point);
      const lastSampleAt = Number(state.lastSampleAt || state.lastOkAt || state.lastUnsafeAt || state.lastErrorAt || 0) || 0;
      const radiusInfo = loginPointSafetyRadiusInfo(state);
      return {
        ...state,
        required,
        radius: radiusInfo.radius,
        lowHpRadius: radiusInfo.lowHpRadius,
        healthyRadius: radiusInfo.healthyRadius,
        healthyHpThreshold: radiusInfo.healthyHpThreshold,
        radiusReason: radiusInfo.radiusReason,
        lastExitSelfHp: radiusInfo.lastExitSelfHp,
        lastExitSelfHpKnown: radiusInfo.lastExitSelfHpKnown,
        hasPoint,
        missingPoint: !hasPoint && required > 0,
        satisfied: required <= 0 || (hasPoint && state.streak >= required),
        remaining: hasPoint ? Math.max(0, required - state.streak) : required,
        lastSampleAt,
        lastOkAgeMs: state.lastOkAt ? Math.max(0, Math.round(t - Number(state.lastOkAt || t))) : null,
        lastUnsafeAgeMs: state.lastUnsafeAt ? Math.max(0, Math.round(t - Number(state.lastUnsafeAt || t))) : null,
        lastErrorAgeMs: state.lastErrorAt ? Math.max(0, Math.round(t - Number(state.lastErrorAt || t))) : null,
        lastSampleAgeMs: lastSampleAt ? Math.max(0, Math.round(t - lastSampleAt)) : null
      };
    }

    function resetLoginPointSafetyGate(reason = 'exit', exitSelfLike = null) {
      const t = Date.now();
      const state = readLoginPointSafetyState(t);
      const exitHp = loginPointSafetyExitSelfHpFrom(exitSelfLike);
      state.streak = 0;
      state.lastDanger = null;
      state.lastError = '';
      state.lastExitSelfHp = Number.isFinite(exitHp) ? exitHp : null;
      state.lastExitSelfHpKnown = Number.isFinite(exitHp);
      state.lastExitSelfHpAt = t;
      state.lastExitSelfHpReason = String(reason || 'exit');
      state.radius = loginPointSafetyRadius(state);
      state.resetAt = t;
      state.resetReason = String(reason || 'exit');
      writeLoginPointSafetyState(state);
      return loginPointSafetyStatus(t);
    }

    function rememberLoginPointDamageThreat(injury, reason = 'self-damage') {
      const t = Date.now();
      const state = readLoginPointSafetyState(t);
      const candidates = [
        injury?.nearestActive,
        injury?.nearestAvoidance,
        injury?.nearestHuman
      ].filter(candidate => Boolean(loginPointDamageEvidence(candidate, injury)));
      if (!candidates.length) return state;
      const existing = new Map((state.damagedBy?.actors || []).map(actor => [String(actor.key || ''), actor]));
      for (const candidate of candidates) {
        const evidence = loginPointDamageEvidence(candidate, injury);
        const actor = loginPointActorSummary(candidate, { at: t, reason, evidence });
        if (!actor?.key) continue;
        existing.set(actor.key, { ...(existing.get(actor.key) || {}), ...actor, at: t, reason });
      }
      state.damagedBy = {
        dayKey: loginPointSafetyDayKey(t),
        actors: Array.from(existing.values()).slice(-80)
      };
      writeLoginPointSafetyState(state);
      return state;
    }

    function maybeRecordLoginPoint(currentSummary) {
      if (!currentSummary || !Number.isFinite(Number(currentSummary.x)) || !Number.isFinite(Number(currentSummary.y))) return null;
      const t = Date.now();
      const loginAt = inferLoginPointLoginAt(t);
      if (!loginAt) return null;
      const maxAge = Math.max(Number(cfg.postLoginGraceMs || 45000) * 2, 60000);
      if (t - loginAt > maxAge) return null;
      const state = readLoginPointSafetyState(t);
      if (Number(state.point?.loginAt || 0) >= loginAt) return state;
      bot.lastLoginAt = loginAt;
      state.point = {
        x: Number(currentSummary.x),
        y: Number(currentSummary.y),
        userId: currentSummary.id ?? currentSummary.user_id ?? getCurrentUserId() ?? null,
        at: t,
        tick: Number(bot.globalState?.tick || 0) || 0,
        loginAt,
        source: 'post-login-self'
      };
      state.streak = 0;
      state.lastSampleAt = 0;
      state.lastOkAt = 0;
      state.lastUnsafeAt = 0;
      state.lastErrorAt = 0;
      state.lastTick = 0;
      state.lastDanger = null;
      state.lastError = '';
      state.movement = {};
      writeLoginPointSafetyState(state);
      return state;
    }

    function inferLoginPointLoginAt(t = Date.now()) {
      const candidates = [
        bot.lastLoginAt,
        bot.lastLoginResult?.at,
        bot.lastManualLoginResult?.at,
        bot.session?.startedAt
      ].map(value => Number(value || 0)).filter(value => Number.isFinite(value) && value > 0 && value <= t);
      try {
        const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
        const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
        if (suppressUntil > t && /oauth|callback|login/i.test(suppressReason)) {
          const inferredAt = Math.max(0, suppressUntil - Math.max(1000, Number(cfg.postLoginGraceMs) || 45000));
          if (inferredAt > 0 && inferredAt <= t) candidates.push(inferredAt);
        }
      } catch (_) {}
      if (candidates.length) return Math.max(...candidates);
      return 0;
    }

  return {
    loginPointSafetySuccessRequired,
    optionalFiniteNumber,
    loginPointSafetyLastExitHp,
    loginPointSafetyHealthyHpThreshold,
    loginPointSafetyLowHpRadius,
    loginPointSafetyHealthyRadius,
    loginPointSafetyRadiusInfo,
    loginPointSafetyRadius,
    loginPointSafetyDayKey,
    finiteNumber,
    loginPointSafetyExitSelfHpFrom,
    loginPointSafetyExitSelfForDetail,
    loginPointEntityKey,
    loginPointActorSummary,
    normalizeLoginPointSafetyState,
    loginPointHasPoint,
    loginPointPointStamp,
    mergeLoginPointSafetyState,
    readLoginPointSafetyState,
    writeLoginPointSafetyState,
    loginPointDamageActorKeys,
    loginPointDamageEvidence,
    loginPointEntityMoved,
    loginPointActiveModeStaminaSpent,
    loginPointActiveModeDangerReason,
    loginPointDangerReason,
    evaluateLoginPointSafety,
    noteLoginPointSafetyProbe,
    loginPointSafetyStatus,
    resetLoginPointSafetyGate,
    rememberLoginPointDamageThreat,
    maybeRecordLoginPoint,
    inferLoginPointLoginAt
  };
}

module.exports = {
  createLoginPointSafetyRuntime
};
