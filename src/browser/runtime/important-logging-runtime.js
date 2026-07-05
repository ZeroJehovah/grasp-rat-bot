'use strict';

const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./runtime-utils');

function createImportantLoggingRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    importantLogsKey,
    queueCombatLogEntry = () => false,
    flushCombatLogs = () => false,
    combatLogSuspendReason = () => '',
    combatLogIsAfkAttack = () => false,
    getCurrentUserId = () => null,
    pushBounded = (list, item, max) => {
      if (!Array.isArray(list)) return;
      list.push(item);
      while (list.length > max) list.shift();
    },
    knownHpValue = () => null,
    dropValue = () => 0,
    isAfkProfitTarget = () => false,
    isCurrentlyActive = () => false,
    isMovingThreat = () => false,
    isFiringEntity = () => false,
    summarizeSelf = value => value,
    getNativeEntityList = () => [],
    getEntities = () => [],
    isAlive = () => false,
    firstFiniteNumber = (...values) => values.find(value => Number.isFinite(Number(value)))
  } = runtime;
  const localStorage = storage;
  const IMPORTANT_LOGS_KEY = importantLogsKey;

  function importantLogDay(t = Date.now()) {
    const d = new Date(Number(t) || Date.now());
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function importantLogId(prefix, t = Date.now(), label = '') {
    const cleanPrefix = sanitizeCombatLogIdPart(prefix || 'important', 'important');
    const cleanLabel = sanitizeCombatLogIdPart(label || getCurrentUserId() || 'event', 'event');
    return cleanPrefix + '-' + importantLogDay(t).replace(/-/g, '') + '-' + (Number(t) || Date.now()).toString(36) + '-' + cleanLabel;
  }

  function importantLogFileId(t = Date.now()) {
    return 'important-' + importantLogDay(t).replace(/-/g, '');
  }

  function normalizeImportantLogsStore(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const cleanList = (list, max) => (Array.isArray(list) ? list.filter(item => item && typeof item === 'object').slice(-max) : []);
    return {
      schemaVersion: 1,
      updatedAt: Number(raw.updatedAt || 0) || 0,
      sessions: cleanList(raw.sessions, 240),
      combats: cleanList(raw.combats, 600),
      events: cleanList(raw.events, 1200)
    };
  }

  function readImportantLogsStore() {
    try {
      return normalizeImportantLogsStore(JSON.parse(localStorage.getItem(IMPORTANT_LOGS_KEY) || 'null'));
    } catch (_) {
      return normalizeImportantLogsStore(null);
    }
  }

  function trimImportantLogsStore(store) {
    const next = normalizeImportantLogsStore(store);
    next.sessions = next.sessions.slice(-240);
    next.combats = next.combats.slice(-600);
    next.events = next.events.slice(-1200);
    return next;
  }

  function writeImportantLogsStore(store) {
    try {
      const next = trimImportantLogsStore({ ...store, updatedAt: Date.now() });
      localStorage.setItem(IMPORTANT_LOGS_KEY, safeStringify(next));
      if (bot.importantLogging) bot.importantLogging.localWriteError = '';
      return next;
    } catch (err) {
      if (bot.importantLogging) bot.importantLogging.localWriteError = err?.message || String(err);
      return null;
    }
  }

  function updateImportantLogsStore(mutator) {
    const store = readImportantLogsStore();
    try {
      mutator(store);
    } catch (err) {
      if (bot.importantLogging) bot.importantLogging.localWriteError = err?.message || String(err);
    }
    return writeImportantLogsStore(store);
  }

  function upsertImportantListItem(list, key, item) {
    const id = item?.[key];
    if (!id) return false;
    const index = list.findIndex(existing => String(existing?.[key] || '') === String(id));
    if (index >= 0) {
      const previous = list[index] || {};
      list[index] = {
        ...previous,
        ...item,
        remoteSentAt: previous.remoteSentAt || item.remoteSentAt || 0,
        remoteError: item.remoteError || previous.remoteError || ''
      };
    } else {
      list.push(item);
    }
    return true;
  }

  function importantEventAlreadyPending(id) {
    if (!id) return false;
    const state = bot.combatLogging || {};
    if ((Array.isArray(state.pending) ? state.pending : []).some(entry => String(entry?.importantLogId || '') === String(id))) return true;
    return (Array.isArray(bot.importantLogging?.queuedRemoteIds) ? bot.importantLogging.queuedRemoteIds : []).includes(id);
  }

  function queueImportantLogRemote(event) {
    if (!event?.importantLogId) return false;
    const state = bot.combatLogging;
    if (!state?.endpoint) return false;
    if (importantEventAlreadyPending(event.importantLogId)) return false;
    const queued = queueCombatLogEntry({
      ...event,
      type: 'important-log',
      importantLog: true,
      combatId: event.combatId || importantLogFileId(event.at)
    }, { important: true });
    if (queued) {
      if (!Array.isArray(bot.importantLogging.queuedRemoteIds)) bot.importantLogging.queuedRemoteIds = [];
      pushBounded(bot.importantLogging.queuedRemoteIds, event.importantLogId, 500);
      bot.importantLogging.lastRemoteQueuedAt = Date.now();
    }
    return queued;
  }

  function markImportantLogsRemoteSent(ids, t = Date.now()) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String));
    if (!idSet.size) return;
    updateImportantLogsStore(store => {
      for (const event of store.events) {
        if (idSet.has(String(event.importantLogId || ''))) {
          event.remoteSentAt = t;
          event.remoteError = '';
        }
      }
    });
    if (Array.isArray(bot.importantLogging?.queuedRemoteIds)) {
      bot.importantLogging.queuedRemoteIds = bot.importantLogging.queuedRemoteIds.filter(id => !idSet.has(String(id)));
    }
    if (bot.importantLogging) bot.importantLogging.lastRemoteError = '';
  }

  function markImportantLogsRemoteError(ids, error, t = Date.now()) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String));
    if (!idSet.size) return;
    const message = String(error || 'remote send failed');
    updateImportantLogsStore(store => {
      for (const event of store.events) {
        if (idSet.has(String(event.importantLogId || ''))) {
          event.remoteError = message;
          event.remoteErrorAt = t;
        }
      }
    });
    if (bot.importantLogging) bot.importantLogging.lastRemoteError = message;
  }

  function recordImportantEvent(importantType, payload = {}) {
    const t = Number(payload.at || Date.now()) || Date.now();
    const eventId = String(payload.importantLogId || importantLogId(importantType, t, payload.sessionId || payload.combatSummaryId || payload.name || payload.userId || 'event'));
    const event = {
      ...safeJsonClone(payload),
      type: 'important-log',
      importantLog: true,
      importantType: String(importantType || 'event'),
      importantLogId: eventId,
      at: t,
      day: importantLogDay(t),
      combatId: payload.combatId || importantLogFileId(t),
      version: cfg.version,
      sourceHash: cfg.sourceHash,
      injectedBy: cfg.injectedBy,
      url: location.href,
      userId: payload.userId ?? bot.session?.userId ?? getCurrentUserId() ?? null
    };
    updateImportantLogsStore(store => {
      upsertImportantListItem(store.events, 'importantLogId', event);
    });
    bot.importantLogging.lastEventAt = t;
    const state = bot.combatLogging || {};
    const pending = Array.isArray(state.pending) ? state.pending : [];
    const pendingIndex = pending.findIndex(entry => String(entry?.importantLogId || '') === event.importantLogId);
    if (pendingIndex >= 0) pending[pendingIndex] = { ...pending[pendingIndex], ...event };
    else queueImportantLogRemote(event);
    if (event.importantType === 'session-end') flushCombatLogs(true);
    return event;
  }

  function restoreImportantLogsForRemote() {
    const state = bot.combatLogging;
    if (!state?.endpoint) return 0;
    const store = readImportantLogsStore();
    const pending = store.events
      .filter(event => event?.importantLogId && !event.remoteSentAt)
      .slice(-250);
    let queued = 0;
    for (const event of pending) {
      if (queueImportantLogRemote(event)) queued += 1;
    }
    bot.importantLogging.restoredRemote = queued;
    if (queued) flushCombatLogs(true);
    return queued;
  }

  function importantKillSummary(item) {
    if (!item || typeof item !== 'object') return null;
    const rewardRaw = item.rewardCoins ?? item.drop;
    const rawRewardCoins = Number.isFinite(Number(rewardRaw)) ? Math.max(0, Math.round(Number(rewardRaw))) : 0;
    const targetDrop = Number.isFinite(Number(item.targetDrop ?? item.drop ?? item.rewardCoins)) ? Math.max(0, Math.round(Number(item.targetDrop ?? item.drop ?? item.rewardCoins))) : null;
    const rewardConfirmed = Boolean(item.rewardConfirmed || item.dropMatched);
    const killConfirmed = Boolean(item.killConfirmed || item.chatConfirmed || item.dropMatched || item.rewardConfirmed);
    const rewardCoins = rewardConfirmed ? rawRewardCoins : 0;
    const playerCategory = importantKillPlayerCategory(item);
    const battleStartedAt = Number(item.battleStartedAt ?? item.startedAt ?? 0) || 0;
    const battleEndedAt = Number(item.battleEndedAt ?? item.endedAt ?? item.at ?? 0) || 0;
    const battleDurationMs = Number.isFinite(Number(item.battleDurationMs))
      ? Math.max(0, Math.round(Number(item.battleDurationMs)))
      : (battleStartedAt && battleEndedAt ? Math.max(0, Math.round(battleEndedAt - battleStartedAt)) : 0);
    const coin = item.coin && typeof item.coin === 'object' ? {
      id: item.coin.id ?? item.coin.drop_id ?? item.coin.coin_id ?? null,
      amount: Number.isFinite(Number(item.coin.amount)) ? Math.max(0, Math.round(Number(item.coin.amount))) : null,
      x: Number.isFinite(Number(item.coin.x)) ? Math.round(Number(item.coin.x)) : null,
      y: Number.isFinite(Number(item.coin.y)) ? Math.round(Number(item.coin.y)) : null,
      distance: Number.isFinite(Number(item.coin.distance)) ? Math.round(Number(item.coin.distance)) : null
    } : null;
    return {
      at: Number(item.at || 0) || 0,
      time: item.time || '',
      name: item.victim || item.name || '',
      id: item.id ?? item.userId ?? null,
      rewardCoins,
      reportedRewardCoins: rawRewardCoins,
      playerCategory,
      afk: playerCategory === 'afk',
      active: playerCategory === 'active',
      combat: Boolean(item.combat),
      combatIntent: String(item.combatIntent || ''),
      mode: String(item.mode || item.current_join_mode || ''),
      matchedAttack: Boolean(item.matchedAttack),
      attackDistance: Number.isFinite(Number(item.attackDistance)) ? Math.round(Number(item.attackDistance)) : null,
      source: String(item.source || ''),
      chatConfirmed: Boolean(item.chatConfirmed),
      dropMatched: Boolean(item.dropMatched),
      rewardConfirmed,
      killConfirmed,
      targetDrop,
      unconfirmedDropCoins: rewardConfirmed ? 0 : Math.max(0, Number(targetDrop || rawRewardCoins) || 0),
      coin,
      battleStartedAt,
      battleEndedAt,
      battleDurationMs,
      battleStaminaSpentStartMs: item.battleStaminaSpentStartMs !== null && item.battleStaminaSpentStartMs !== undefined && item.battleStaminaSpentStartMs !== '' && Number.isFinite(Number(item.battleStaminaSpentStartMs)) ? Math.max(0, Math.round(Number(item.battleStaminaSpentStartMs))) : null,
      battleStaminaSpentEndMs: item.battleStaminaSpentEndMs !== null && item.battleStaminaSpentEndMs !== undefined && item.battleStaminaSpentEndMs !== '' && Number.isFinite(Number(item.battleStaminaSpentEndMs)) ? Math.max(0, Math.round(Number(item.battleStaminaSpentEndMs))) : null,
      battleStaminaSpentMs: item.battleStaminaSpentMs !== null && item.battleStaminaSpentMs !== undefined && item.battleStaminaSpentMs !== '' && Number.isFinite(Number(item.battleStaminaSpentMs)) ? Math.max(0, Math.round(Number(item.battleStaminaSpentMs))) : null
    };
  }

  function importantKillPlayerCategory(item) {
    if (!item || typeof item !== 'object') return 'unknown';
    const explicit = String(item.playerCategory || item.killCategory || '').toLowerCase();
    if (explicit === 'active' || explicit === 'afk') return explicit;
    const activeSignal = Boolean(item.combat || item.active || item.currentlyActive || item.firing || item.moving);
    if (explicit && explicit !== 'unknown') return 'unknown';
    if (activeSignal) return 'active';
    if (explicit === 'unknown') return 'unknown';
    if (item.afk === false) return 'active';
    if (item.afk === true || item.matchedAttack || item.dropMatched || item.chatConfirmed) return 'afk';
    return 'unknown';
  }

  function importantSessionKills(session) {
    const startedAt = Number(session?.startedAt || 0);
    const exitAt = Number(session?.exitAt || 0);
    if (!startedAt) return [];
    return bot.killHistory
      .map(importantKillSummary)
      .filter(Boolean)
      .filter(item => item.at >= startedAt && (!exitAt || item.at <= exitAt + 30000));
  }

  function importantSessionRecord(session = bot.session || {}, selfSummary = null, extra = {}) {
    const t = Number(extra.at || Date.now()) || Date.now();
    const startedAt = Number(session.startedAt || 0) || t;
    const exitAt = Number(extra.exitAt || session.exitAt || 0) || 0;
    const kills = importantSessionKills({ ...session, exitAt });
    const killRewardCoins = kills.reduce((sum, item) => sum + Math.max(0, Number(item.rewardCoins || 0) || 0), 0);
    const afkKills = kills.filter(item => importantKillPlayerCategory(item) === 'afk');
    const activeKills = kills.filter(item => importantKillPlayerCategory(item) === 'active');
    const pickedCoins = Math.max(0, Math.round(Number(session.coinPickupTotal || 0) || 0));
    const coinsGained = Math.max(0, Math.round(Number(session.coinsGained || 0) || 0));
    const pureRefreshCoins = Math.max(0, Math.round((pickedCoins || coinsGained) - killRewardCoins));
    return {
      sessionId: session.importantSessionId || importantLogId('session', startedAt, session.userId || getCurrentUserId() || 'user'),
      userId: session.userId ?? selfSummary?.id ?? getCurrentUserId() ?? null,
      loginAt: startedAt,
      loginIso: new Date(startedAt).toISOString(),
      exitAt,
      exitIso: exitAt ? new Date(exitAt).toISOString() : '',
      exitReason: String(extra.exitReason || session.exitReason || ''),
      exitSummary: String(extra.exitSummary || session.exitSummary || ''),
      loginDurationMs: startedAt ? Math.max(0, (exitAt || t) - startedAt) : 0,
      staminaSpentMs: Math.max(0, Math.round(Number(session.stamina1dSpentMs || 0) || 0)),
      pickedCoins,
      coinsGained,
      killRewardCoins,
      pureRefreshCoins,
      killCount: kills.length,
      afkKillCount: afkKills.length,
      afkKillRewardCoins: afkKills.reduce((sum, item) => sum + Math.max(0, Number(item.rewardCoins || 0) || 0), 0),
      activeKillCount: activeKills.length,
      activeKillRewardCoins: activeKills.reduce((sum, item) => sum + Math.max(0, Number(item.rewardCoins || 0) || 0), 0),
      kills,
      baseCoins: Number.isFinite(Number(session.baseCoins)) ? Number(session.baseCoins) : null,
      currentCoins: Number(selfSummary?.coins ?? bot.lastSelf?.coins ?? 0) || 0,
      stamina1dObservedMax: Number.isFinite(Number(session.stamina1dObservedMax)) ? Number(session.stamina1dObservedMax) : null,
      stamina1dObservedMin: Number.isFinite(Number(session.stamina1dObservedMin)) ? Number(session.stamina1dObservedMin) : null,
      stamina1dLastRemaining: Number.isFinite(Number(session.stamina1dLastRemaining)) ? Number(session.stamina1dLastRemaining) : null,
      stamina1dLastLimit: Number.isFinite(Number(session.stamina1dLastLimit)) ? Number(session.stamina1dLastLimit) : null,
      version: cfg.version,
      sourceHash: cfg.sourceHash,
      updatedAt: t
    };
  }

  function upsertImportantSessionRecord(session = bot.session || {}, selfSummary = null, extra = {}) {
    if (!session?.startedAt) return null;
    const record = importantSessionRecord(session, selfSummary, extra);
    updateImportantLogsStore(store => {
      upsertImportantListItem(store.sessions, 'sessionId', record);
    });
    return record;
  }

  function startImportantSession(session = bot.session || {}, selfSummary = null, t = Date.now()) {
    if (!session.startedAt) return null;
    if (!session.importantSessionId) session.importantSessionId = importantLogId('session', t, session.userId || selfSummary?.id || getCurrentUserId() || 'user');
    if (!session.importantStartEventId) session.importantStartEventId = session.importantSessionId + ':start';
    closeOpenImportantSessionsBeforeStart(session, selfSummary, t);
    session.exitAt = 0;
    session.exitReason = '';
    session.exitSummary = '';
    const record = upsertImportantSessionRecord(session, selfSummary, { at: t });
    recordImportantEvent('session-start', {
      importantLogId: session.importantStartEventId,
      at: t,
      sessionId: session.importantSessionId,
      userId: record?.userId ?? null,
      loginAt: t,
      session: record
    });
    return record;
  }

  function closeOpenImportantSessionsBeforeStart(session = bot.session || {}, selfSummary = null, t = Date.now()) {
    const nextSessionId = String(session.importantSessionId || '');
    const userId = session.userId ?? selfSummary?.id ?? getCurrentUserId() ?? null;
    const closed = [];
    updateImportantLogsStore(store => {
      for (const record of store.sessions) {
        if (!record || typeof record !== 'object') continue;
        const sessionId = String(record.sessionId || '');
        if (!sessionId || sessionId === nextSessionId) continue;
        if (Number(record.exitAt || 0)) continue;
        const loginAt = Number(record.loginAt || 0);
        if (!loginAt || loginAt >= t) continue;
        const recordUser = record.userId ?? null;
        if (userId !== null && recordUser !== null && String(recordUser) !== String(userId)) continue;
        const exitReason = 'session-interrupted-before-next-login';
        const exitSummary = '下一次登录时发现上一局已结束，按下一次登录时间收口';
        Object.assign(record, {
          exitAt: t,
          exitIso: new Date(t).toISOString(),
          exitReason,
          exitSummary,
          loginDurationMs: Math.max(0, Math.round(t - loginAt)),
          inferredExit: true,
          inferredExitReason: 'next-session-start',
          version: cfg.version,
          sourceHash: cfg.sourceHash,
          updatedAt: t
        });
        closed.push(safeJsonClone(record) || { ...record });
      }
    });
    for (const record of closed) {
      recordImportantEvent('session-end', {
        importantLogId: String(record.sessionId || importantLogId('session', t, userId || 'user')) + ':end',
        at: record.exitAt || t,
        sessionId: record.sessionId || '',
        userId: record.userId ?? userId,
        exitAt: record.exitAt || t,
        exitReason: record.exitReason,
        exitSummary: record.exitSummary,
        inferredExit: true,
        session: record
      });
    }
    return closed.length;
  }

  function importantExitReasonRank(reason) {
    const text = String(reason || '').toLowerCase();
    if (/exit-confirmed|leave-success|leave-http-403/.test(text)) return 90;
    if (/combat|pursuit|injury|offline|stamina|control-ws/.test(text)) return 75;
    if (/dead|not-alive|waitingrevive/.test(text)) return 65;
    if (/no-self|missing self/.test(text)) return 45;
    if (/session-reset|user-changed/.test(text)) return 25;
    return text ? 35 : 0;
  }

  function noteImportantSessionExit(reason, selfSummary = null, t = Date.now(), extra = {}) {
    const session = bot.session || null;
    if (!session?.startedAt) return null;
    if (!session.importantSessionId) session.importantSessionId = importantLogId('session', Number(session.startedAt || t), session.userId || selfSummary?.id || getCurrentUserId() || 'user');
    const nextReason = String(reason || extra.exitReason || 'unknown');
    const previousRank = importantExitReasonRank(session.exitReason);
    const nextRank = importantExitReasonRank(nextReason);
    if (!session.exitAt || nextRank >= previousRank) {
      session.exitAt = Number(t || Date.now()) || Date.now();
      session.exitReason = nextReason;
      session.exitSummary = String(extra.exitSummary || extra.exit?.summary || extra.exit?.displayReason || session.exitSummary || '');
    }
    if (!session.importantEndEventId) session.importantEndEventId = session.importantSessionId + ':end';
    const record = upsertImportantSessionRecord(session, selfSummary || bot.lastSelf, {
      at: Date.now(),
      exitAt: session.exitAt,
      exitReason: session.exitReason,
      exitSummary: session.exitSummary
    });
    recordImportantEvent('session-end', {
      importantLogId: session.importantEndEventId,
      at: session.exitAt || t,
      sessionId: session.importantSessionId,
      userId: record?.userId ?? null,
      exitAt: session.exitAt || t,
      exitReason: session.exitReason,
      exitSummary: session.exitSummary,
      exit: extra.exit ? safeJsonClone(extra.exit) : null,
      session: record
    });
    return record;
  }

  function recordImportantKill(kill) {
    const summary = importantKillSummary(kill);
    if (!summary) return null;
    const session = bot.session || {};
    const sessionId = session.importantSessionId || '';
    const record = upsertImportantSessionRecord(session, bot.lastSelf, { at: summary.at });
    recordImportantEvent('kill', {
      importantLogId: importantLogId('kill', summary.at, summary.name || summary.id || 'target'),
      at: summary.at,
      sessionId,
      userId: session.userId ?? getCurrentUserId() ?? null,
      kill: summary,
      session: record
    });
    const active = bot.importantLogging?.activeCombat;
    if (active && importantCombatMatchesKill(active, summary)) {
      finishImportantCombat('kill', { at: summary.at, kill: summary });
    }
    return summary;
  }

  function importantHpValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function importantTargetKey(target) {
    const id = target?.id ?? target?.user_id ?? target?.targetId;
    if (id !== undefined && id !== null && id !== '') return 'id:' + String(id);
    const name = String(target?.name || target?.label || '');
    if (name) return 'name:' + name;
    return '';
  }

  function importantCombatTargetSummary(target) {
    if (!target) return null;
    const hp = importantHpValue(knownHpValue(target));
    return {
      id: target.id ?? target.user_id ?? target.targetId ?? null,
      name: target.name || target.label || '',
      key: importantTargetKey(target),
      hp,
      displayHp: importantHpValue(target.hp),
      maxHp: importantHpValue(target.maxHp ?? target.max_hp),
      drop: Math.max(0, Math.round(Number(target.drop ?? dropValue(target) ?? 0) || 0)),
      distance: Number.isFinite(Number(target.distance)) ? Math.round(Number(target.distance)) : null,
      mode: target.mode || target.current_join_mode || '',
      life: target.life || ''
    };
  }

  function updateImportantCombatHp(record, prefix, hp) {
    const value = importantHpValue(hp);
    if (value === null) return;
    const startKey = prefix + 'HpStart';
    const endKey = prefix + 'HpEnd';
    const minKey = prefix + 'HpMin';
    const maxKey = prefix + 'HpMax';
    const deltaKey = prefix + 'HpDelta';
    const previousStart = importantHpValue(record[startKey]);
    const previousMin = importantHpValue(record[minKey]);
    const previousMax = importantHpValue(record[maxKey]);
    if (previousStart === null) record[startKey] = value;
    record[endKey] = value;
    record[minKey] = previousMin === null ? value : Math.min(previousMin, value);
    record[maxKey] = previousMax === null ? value : Math.max(previousMax, value);
    const currentStart = importantHpValue(record[startKey]);
    record[deltaKey] = currentStart === null ? null : Math.round((value - currentStart) * 100) / 100;
  }

  function importantSessionStaminaSpentMs(session = bot.session || {}) {
    return Math.max(0, Math.round(Number(session?.stamina1dSpentMs || 0) || 0));
  }

  function importantCombatDecisionIsExitOnly(decision, reason = decision?.reason || '') {
    const text = String(reason || '').toLowerCase();
    if (decision?.kind === 'leave' || decision?.leave) return true;
    if (importantCombatReasonIsNonCombatSafety(text)) return true;
    if (importantCombatReasonIsPostCombatObservation(text)) return true;
    return /leave|exit|offline|pursuit|injury|stamina|login|no-self|not-alive|paused|cloudflare|control-ws|flee|recover/.test(text);
  }

  function importantCombatReasonIsNonCombatSafety(reason) {
    const text = String(reason || '').toLowerCase();
    return /^(avoid-invulnerable-target|recovery-avoid-humans|passive-panic-distance|active-threat-before-bullet-range|active-threat-caution-migration|active-threat-return-block|return-block-lateral-scan)$/.test(text);
  }

  function importantCombatReasonIsPostCombatObservation(reason) {
    const text = String(reason || '').toLowerCase();
    return /^(wait-for-full-stamina-and-hp|recovery-foot-coin)$/.test(text);
  }

  function importantCombatHasActualEngagement(record) {
    if (!record) return false;
    if (record.kill) return true;
    if (record.engagementObserved === true) return true;
    if (Number(record.enemyHpDelta || 0) < 0 || Number(record.selfHpDelta || 0) < 0) return true;
    return !importantCombatDecisionIsExitOnly({ kind: record.startedWithExitOnly ? 'leave' : '', reason: record.startReason }, record.startReason);
  }

  function updateImportantCombatStamina(record, session = bot.session || {}) {
    if (!record) return;
    const current = importantSessionStaminaSpentMs(session);
    if (!Number.isFinite(Number(record.staminaSpentStartMs))) record.staminaSpentStartMs = current;
    record.staminaSpentEndMs = current;
    record.staminaSpentMs = Math.max(0, Math.round(current - Number(record.staminaSpentStartMs || 0)));
  }

  function importantCombatSampleFromDecision(decision) {
    const reason = String(decision?.reason || '');
    const target = decision?.target || decision?.combatState?.target || decision?.pendingCombatLeave?.target || bot.combatTarget || null;
    const combat = Boolean(decision?.combat || decision?.combatState || decision?.pendingCombatLeave || /^combat-/.test(reason));
    if (!combat || !target) return null;
    try {
      if (combatLogIsAfkAttack({ decision, target }, decision)) return null;
    } catch (_) {}
    const self = decision?.self || bot.lastSelf || null;
    const targetSummary = importantCombatTargetSummary(target);
    if (!targetSummary?.key && !targetSummary?.name) return null;
    return {
      at: Date.now(),
      reason,
      source: decision?.source || '',
      exitOnly: importantCombatDecisionIsExitOnly(decision, reason),
      selfHp: importantHpValue(knownHpValue(self)),
      target: targetSummary,
      targetHp: targetSummary.hp ?? targetSummary.displayHp
    };
  }

  function startImportantCombat(sample) {
    const session = bot.session || {};
    const id = importantLogId('combat', sample.at, sample.target?.name || sample.target?.id || 'target');
    const record = {
      combatSummaryId: id,
      sessionId: session.importantSessionId || '',
      userId: session.userId ?? getCurrentUserId() ?? null,
      startedAt: sample.at,
      endedAt: 0,
      durationMs: 0,
      enemy: sample.target,
      enemyKey: sample.target?.key || '',
      startReason: sample.reason || '',
      lastReason: sample.reason || '',
      lastSampleAt: sample.at,
      sampleCount: 0,
      selfHpStart: null,
      selfHpEnd: null,
      selfHpMin: null,
      selfHpMax: null,
      selfHpDelta: null,
      enemyHpStart: null,
      enemyHpEnd: null,
      enemyHpMin: null,
      enemyHpMax: null,
      enemyHpDelta: null,
      startedWithExitOnly: Boolean(sample.exitOnly),
      engagementObserved: !sample.exitOnly,
      staminaSpentStartMs: importantSessionStaminaSpentMs(session),
      staminaSpentEndMs: importantSessionStaminaSpentMs(session),
      staminaSpentMs: 0,
      result: 'ongoing',
      resultReason: '',
      kill: null,
      version: cfg.version,
      sourceHash: cfg.sourceHash,
      lastPersistAt: 0,
      updatedAt: sample.at
    };
    bot.importantLogging.activeCombat = record;
    updateImportantCombatRecord(record, sample);
    return record;
  }

  function updateImportantCombatRecord(record, sample) {
    if (!record || !sample) return null;
    const previousSelfHp = importantHpValue(record.selfHpEnd);
    const previousEnemyHp = importantHpValue(record.enemyHpEnd);
    record.lastSampleAt = sample.at;
    record.lastReason = sample.reason || record.lastReason || '';
    if (!sample.exitOnly) record.engagementObserved = true;
    record.sampleCount = Math.max(0, Number(record.sampleCount || 0) || 0) + 1;
    record.enemy = { ...(record.enemy || {}), ...(sample.target || {}) };
    record.enemyKey = record.enemyKey || sample.target?.key || '';
    updateImportantCombatHp(record, 'self', sample.selfHp);
    updateImportantCombatHp(record, 'enemy', sample.targetHp);
    updateImportantCombatStamina(record);
    record.durationMs = Math.max(0, Math.round((record.endedAt || sample.at) - Number(record.startedAt || sample.at)));
    record.updatedAt = sample.at;
    const selfHpChanged = importantHpValue(record.selfHpEnd) !== previousSelfHp;
    const enemyHpChanged = importantHpValue(record.enemyHpEnd) !== previousEnemyHp;
    const persistDue = !record.lastPersistAt || sample.at - Number(record.lastPersistAt || 0) >= 1000 || selfHpChanged || enemyHpChanged;
    if (persistDue) {
      record.lastPersistAt = sample.at;
      updateImportantLogsStore(store => {
        upsertImportantListItem(store.combats, 'combatSummaryId', safeJsonClone(record) || record);
      });
    }
    return record;
  }

  function importantCombatMatchesKill(record, kill) {
    if (!record || !kill) return false;
    const enemy = record.enemy || {};
    if (enemy.id !== null && enemy.id !== undefined && kill.id !== null && kill.id !== undefined && String(enemy.id) === String(kill.id)) return true;
    const enemyName = String(enemy.name || '').trim();
    const killName = String(kill.name || '').trim();
    return Boolean(enemyName && killName && enemyName === killName);
  }

  function importantCombatResult(record, reason, extra = {}) {
    const text = String(reason || '').toLowerCase();
    const enemyHp = importantHpValue(record.enemyHpEnd);
    const selfHp = importantHpValue(record.selfHpEnd);
    if (extra.kill || record.kill) return 'won';
    if (enemyHp !== null && enemyHp <= 0) return 'won';
    if ((selfHp !== null && selfHp <= 0) || /dead|not-alive|waitingrevive/.test(text)) return 'lost';
    if (/leave|exit|offline|pursuit|injury|stamina|login|no-self|control-ws/.test(text)) return 'left';
    if (/flee|recover|retreat/.test(text)) return 'retreated';
    return 'disengaged';
  }

  function finishImportantCombat(reason = 'ended', extra = {}) {
    const record = bot.importantLogging?.activeCombat;
    if (!record) return null;
    const t = Number(extra.at || Date.now()) || Date.now();
    if (extra.kill) record.kill = safeJsonClone(extra.kill) || extra.kill;
    if (extra.selfHp !== undefined) updateImportantCombatHp(record, 'self', extra.selfHp);
    if (extra.targetHp !== undefined) updateImportantCombatHp(record, 'enemy', extra.targetHp);
    updateImportantCombatStamina(record);
    record.endedAt = t;
    record.durationMs = Math.max(0, Math.round(t - Number(record.startedAt || t)));
    record.resultReason = String(reason || 'ended');
    record.result = importantCombatResult(record, reason, extra);
    record.updatedAt = t;
    if (!importantCombatHasActualEngagement(record)) {
      updateImportantLogsStore(store => {
        store.combats = store.combats.filter(item => String(item?.combatSummaryId || '') !== String(record.combatSummaryId || ''));
      });
      bot.importantLogging.activeCombat = null;
      return null;
    }
    updateImportantLogsStore(store => {
      upsertImportantListItem(store.combats, 'combatSummaryId', safeJsonClone(record) || record);
    });
    recordImportantEvent('combat-summary', {
      importantLogId: record.combatSummaryId + ':summary',
      at: t,
      sessionId: record.sessionId || bot.session?.importantSessionId || '',
      userId: record.userId ?? bot.session?.userId ?? getCurrentUserId() ?? null,
      combatSummaryId: record.combatSummaryId,
      combat: safeJsonClone(record) || record
    });
    bot.importantLogging.activeCombat = null;
    return record;
  }

  function recordImportantCombatTick(source, decision = bot.lastDecision) {
    const sample = importantCombatSampleFromDecision({ ...(decision || {}), source });
    const active = bot.importantLogging?.activeCombat || null;
    if (sample) {
      if (active && active.enemyKey && sample.target?.key && active.enemyKey !== sample.target.key) {
        finishImportantCombat('target-switched', { at: sample.at });
      }
      if (!bot.importantLogging.activeCombat) {
        if (sample.exitOnly) return;
        startImportantCombat(sample);
      } else {
        updateImportantCombatRecord(bot.importantLogging.activeCombat, sample);
      }
      return;
    }
    if (!active) return;
    const reason = combatLogSuspendReason(decision || {}) || String(decision?.reason || '');
    const ageMs = Math.max(0, Date.now() - Number(active.lastSampleAt || Date.now()));
    const postBufferMs = Math.max(1000, Number(cfg.combatLogPostBufferMs || 10000) || 10000);
    if (reason && (importantCombatReasonIsNonCombatSafety(reason) || importantCombatReasonIsPostCombatObservation(reason))) {
      if (ageMs >= postBufferMs) finishImportantCombat('post-combat-timeout', { at: Date.now() });
      return;
    }
    if (reason && /leave|exit|offline|pursuit|injury|stamina|login|no-self|not-alive|paused|cloudflare|control-ws|flee|recover/.test(reason)) {
      finishImportantCombat(reason, { at: Date.now() });
    } else if (ageMs >= postBufferMs) {
      finishImportantCombat('post-combat-timeout', { at: Date.now() });
    }
  }

  function summarizeImportantLoggingStatus() {
    const store = readImportantLogsStore();
    return {
      key: IMPORTANT_LOGS_KEY,
      sessions: store.sessions.length,
      combats: store.combats.length,
      events: store.events.length,
      pendingRemote: store.events.filter(event => event?.importantLogId && !event.remoteSentAt).length,
      restoredRemote: Number(bot.importantLogging?.restoredRemote || 0),
      activeCombat: bot.importantLogging?.activeCombat ? {
        combatSummaryId: bot.importantLogging.activeCombat.combatSummaryId || '',
        enemy: bot.importantLogging.activeCombat.enemy || null,
        startedAt: Number(bot.importantLogging.activeCombat.startedAt || 0),
        sampleCount: Number(bot.importantLogging.activeCombat.sampleCount || 0)
      } : null,
      localWriteError: bot.importantLogging?.localWriteError || '',
      lastRemoteError: bot.importantLogging?.lastRemoteError || ''
    };
  }

  function attackPlayerCategory(target, action = {}) {
    if (!target) return 'unknown';
    const afkProfit = isAfkProfitTarget(target);
    const realActivity = isCurrentlyActive(target) || isMovingThreat(target) || isFiringEntity(target);
    if (action?.combat || target.combat || (!afkProfit && realActivity)) return 'active';
    if (afkProfit || target.afk === true || action?.combat === false) return 'afk';
    return realActivity ? 'active' : 'unknown';
  }

  function rememberAttack(self, target, actionKind, action = {}) {
    if (!target) return;
    const t = Date.now();
    const targetId = target.id ?? target.user_id;
    const targetName = target.name || '';
    const playerCategory = attackPlayerCategory(target, action);
    const currentlyActive = isCurrentlyActive(target);
    const moving = isMovingThreat(target);
    const firing = isFiringEntity(target);
    const currentStaminaSpentMs = importantSessionStaminaSpentMs(bot.session);
    const previousAttack = bot.attackHistory
      .slice()
      .reverse()
      .find(item => t - Number(item?.at || 0) <= Math.max(1000, Number(cfg.killAttributionMergeMs || 120000))
        && attackIdentityMatches(item, targetName, targetId));
    const battleStartedAt = Number(previousAttack?.battleStartedAt || previousAttack?.at || t) || t;
    const battleStaminaSpentStartMs = Number.isFinite(Number(previousAttack?.battleStaminaSpentStartMs))
      ? Number(previousAttack.battleStaminaSpentStartMs)
      : (Number.isFinite(Number(previousAttack?.staminaSpentMs)) ? Number(previousAttack.staminaSpentMs) : currentStaminaSpentMs);
    pushBounded(bot.attackHistory, {
      at: t,
      action: actionKind,
      id: targetId,
      name: targetName,
      x: Math.round(Number(target.x) || 0),
      y: Math.round(Number(target.y) || 0),
      drop: Number(target.drop || 0),
      afk: playerCategory === 'afk',
      active: playerCategory === 'active',
      playerCategory,
      combat: Boolean(action?.combat || target.combat),
      combatIntent: action?.target?.combatIntent || action?.combatIntent || target.combatIntent || '',
      mode: target.mode || target.current_join_mode || '',
      currentlyActive,
      moving,
      firing,
      distance: Number(target.distance || 0),
      staminaSpentMs: currentStaminaSpentMs,
      battleStartedAt,
      battleStaminaSpentStartMs,
      self: summarizeSelf(self)
    }, 80);
  }

  function killIdentityMatches(item, victim, id) {
    if (!item) return false;
    const victimName = String(victim || '').trim();
    const itemName = String(item.victim || item.name || '').trim();
    const idText = id === undefined || id === null ? '' : String(id);
    const itemId = item.id === undefined || item.id === null ? '' : String(item.id);
    if (idText && itemId && idText === itemId) return true;
    return Boolean(victimName && itemName && victimName === itemName);
  }

  function recentKillHistoryIndex(victim, id, t = Date.now(), windowMs = cfg.killAttributionMergeMs) {
    const maxAge = Math.max(1000, Number(windowMs || cfg.killAttributionMergeMs || 120000));
    for (let i = bot.killHistory.length - 1; i >= 0; i -= 1) {
      const item = bot.killHistory[i];
      if (t - Number(item?.at || 0) > maxAge) continue;
      if (killIdentityMatches(item, victim, id)) return i;
    }
    return -1;
  }

  function attackIdentityMatches(item, victim, id) {
    if (!item) return false;
    const victimName = String(victim || '').trim();
    const itemName = String(item.name || item.victim || '').trim();
    const idText = id === undefined || id === null ? '' : String(id);
    const itemId = item.id === undefined || item.id === null ? '' : String(item.id);
    if (idText && itemId && idText === itemId) return true;
    return Boolean(victimName && itemName && victimName === itemName);
  }

  function recentAttackBattleSummary(victim, id, t = Date.now(), windowMs = cfg.killAttributionMergeMs) {
    const maxAge = Math.max(1000, Number(windowMs || cfg.killAttributionMergeMs || 120000));
    const attacks = bot.attackHistory
      .filter(item => t - Number(item?.at || 0) <= maxAge)
      .filter(item => attackIdentityMatches(item, victim, id))
      .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    if (!attacks.length) return null;
    const first = attacks[0];
    const last = attacks[attacks.length - 1];
    const startedAt = Number(first.battleStartedAt || first.at || t) || t;
    const endedAt = t;
    const startStamina = Number(first.battleStaminaSpentStartMs ?? first.staminaSpentMs);
    const endStamina = Number.isFinite(Number(last.staminaSpentMs))
      ? Number(last.staminaSpentMs)
      : importantSessionStaminaSpentMs(bot.session);
    return {
      battleStartedAt: startedAt,
      battleEndedAt: endedAt,
      battleDurationMs: Math.max(0, Math.round(endedAt - startedAt)),
      battleStaminaSpentStartMs: Number.isFinite(startStamina) ? Math.max(0, Math.round(startStamina)) : null,
      battleStaminaSpentEndMs: Number.isFinite(endStamina) ? Math.max(0, Math.round(endStamina)) : null,
      battleStaminaSpentMs: Number.isFinite(startStamina) && Number.isFinite(endStamina) ? Math.max(0, Math.round(endStamina - startStamina)) : null
    };
  }

  function recordKillHistoryItem(kill, seenKey = '') {
    if (!kill || typeof kill !== 'object') return null;
    const t = Number(kill.at || Date.now()) || Date.now();
    const battle = recentAttackBattleSummary(kill.victim || kill.name || '', kill.id, t);
    if (battle) {
      kill = {
        ...kill,
        battleStartedAt: kill.battleStartedAt || battle.battleStartedAt,
        battleEndedAt: kill.battleEndedAt || battle.battleEndedAt,
        battleDurationMs: kill.battleDurationMs || battle.battleDurationMs,
        battleStaminaSpentStartMs: kill.battleStaminaSpentStartMs !== null && kill.battleStaminaSpentStartMs !== undefined && kill.battleStaminaSpentStartMs !== '' && Number.isFinite(Number(kill.battleStaminaSpentStartMs)) ? kill.battleStaminaSpentStartMs : battle.battleStaminaSpentStartMs,
        battleStaminaSpentEndMs: kill.battleStaminaSpentEndMs !== null && kill.battleStaminaSpentEndMs !== undefined && kill.battleStaminaSpentEndMs !== '' && Number.isFinite(Number(kill.battleStaminaSpentEndMs)) ? kill.battleStaminaSpentEndMs : battle.battleStaminaSpentEndMs,
        battleStaminaSpentMs: kill.battleStaminaSpentMs !== null && kill.battleStaminaSpentMs !== undefined && kill.battleStaminaSpentMs !== '' && Number.isFinite(Number(kill.battleStaminaSpentMs)) ? kill.battleStaminaSpentMs : battle.battleStaminaSpentMs
      };
    }
    const index = recentKillHistoryIndex(kill.victim || kill.name || '', kill.id, t);
    let stored = kill;
    if (index >= 0) {
      const previous = bot.killHistory[index] || {};
      const previousDropMatched = Boolean(previous.dropMatched);
      const nextDropMatched = Boolean(kill.dropMatched);
      const rewardConfirmed = Boolean(previous.rewardConfirmed || kill.rewardConfirmed || previousDropMatched || nextDropMatched);
      const previousReward = Math.max(0, Number(previous.rewardCoins || 0) || 0);
      const nextReward = Math.max(0, Number(kill.rewardCoins || 0) || 0);
      const previousBattleStart = Number(previous.battleStartedAt || 0) || 0;
      const nextBattleStart = Number(kill.battleStartedAt || 0) || 0;
      const previousBattleEnd = Number(previous.battleEndedAt || previous.at || 0) || 0;
      const nextBattleEnd = Number(kill.battleEndedAt || kill.at || 0) || 0;
      const battleStartedAt = previousBattleStart && nextBattleStart ? Math.min(previousBattleStart, nextBattleStart) : (previousBattleStart || nextBattleStart || 0);
      const battleEndedAt = Math.max(previousBattleEnd, nextBattleEnd, t);
      const previousBattleStaminaStart = previous.battleStaminaSpentStartMs !== null && previous.battleStaminaSpentStartMs !== undefined && previous.battleStaminaSpentStartMs !== '' ? Number(previous.battleStaminaSpentStartMs) : NaN;
      const nextBattleStaminaStart = kill.battleStaminaSpentStartMs !== null && kill.battleStaminaSpentStartMs !== undefined && kill.battleStaminaSpentStartMs !== '' ? Number(kill.battleStaminaSpentStartMs) : NaN;
      const previousBattleStaminaEnd = previous.battleStaminaSpentEndMs !== null && previous.battleStaminaSpentEndMs !== undefined && previous.battleStaminaSpentEndMs !== '' ? Number(previous.battleStaminaSpentEndMs) : NaN;
      const nextBattleStaminaEnd = kill.battleStaminaSpentEndMs !== null && kill.battleStaminaSpentEndMs !== undefined && kill.battleStaminaSpentEndMs !== '' ? Number(kill.battleStaminaSpentEndMs) : NaN;
      const battleStaminaSpentStartMs = Number.isFinite(previousBattleStaminaStart) && Number.isFinite(nextBattleStaminaStart)
        ? Math.min(previousBattleStaminaStart, nextBattleStaminaStart)
        : (Number.isFinite(previousBattleStaminaStart) ? previousBattleStaminaStart : (Number.isFinite(nextBattleStaminaStart) ? nextBattleStaminaStart : null));
      const battleStaminaSpentEndMs = Number.isFinite(previousBattleStaminaEnd) && Number.isFinite(nextBattleStaminaEnd)
        ? Math.max(previousBattleStaminaEnd, nextBattleStaminaEnd)
        : (Number.isFinite(nextBattleStaminaEnd) ? nextBattleStaminaEnd : (Number.isFinite(previousBattleStaminaEnd) ? previousBattleStaminaEnd : null));
      const targetDrop = Math.max(
        0,
        Number(kill.targetDrop ?? kill.drop ?? kill.reportedRewardCoins ?? 0) || 0,
        Number(previous.targetDrop ?? previous.drop ?? previous.reportedRewardCoins ?? 0) || 0
      );
      stored = {
        ...previous,
        ...kill,
        at: Number(previous.at || kill.at || t) || t,
        time: kill.time || previous.time || '',
        rewardCoins: rewardConfirmed ? Math.max(previousReward, nextReward) : 0,
        reportedRewardCoins: Math.max(
          0,
          Number(kill.reportedRewardCoins ?? kill.rewardCoins ?? 0) || 0,
          Number(previous.reportedRewardCoins ?? previous.rewardCoins ?? 0) || 0
        ),
        drop: targetDrop,
        targetDrop,
        rewardConfirmed,
        matchedAttack: Boolean(previous.matchedAttack || kill.matchedAttack),
        chatConfirmed: Boolean(previous.chatConfirmed || kill.chatConfirmed),
        dropMatched: Boolean(previousDropMatched || nextDropMatched),
        battleStartedAt,
        battleEndedAt,
        battleDurationMs: battleStartedAt && battleEndedAt ? Math.max(0, Math.round(battleEndedAt - battleStartedAt)) : 0,
        battleStaminaSpentStartMs,
        battleStaminaSpentEndMs,
        battleStaminaSpentMs: Number.isFinite(battleStaminaSpentStartMs) && Number.isFinite(battleStaminaSpentEndMs) ? Math.max(0, Math.round(battleStaminaSpentEndMs - battleStaminaSpentStartMs)) : null,
        source: previous.source && kill.source && previous.source !== kill.source
          ? previous.source + '+' + kill.source
          : (kill.source || previous.source || '')
      };
      bot.killHistory[index] = stored;
    } else {
      pushBounded(bot.killHistory, stored, 40);
    }
    const playerCategory = importantKillPlayerCategory(stored);
    stored.playerCategory = playerCategory;
    stored.afk = playerCategory === 'afk';
    stored.active = playerCategory === 'active';
    recordImportantKill(stored);
    if (seenKey) {
      bot.seenKillKeys.add(seenKey);
      pushBounded(bot.seenKillKeysList, seenKey, 120);
    }
    return stored;
  }

  function killMessageText(raw) {
    if (typeof raw === 'string') return raw;
    if (!raw || typeof raw !== 'object') return '';
    return String(raw.text ?? raw.message ?? raw.content ?? raw.body ?? raw.msg ?? raw.value ?? '');
  }

  function killMessageTime(raw) {
    if (!raw || typeof raw !== 'object') return '';
    const value = raw.time ?? raw.created_at ?? raw.createdAt ?? raw.at ?? raw.timestamp ?? '';
    if (typeof value === 'string' && /^\d{1,2}:\d{2}:\d{2}$/.test(value)) return value;
    return '';
  }

  function collectKillMessageRows() {
    const rows = [];
    if (typeof document !== 'undefined' && document?.body) {
      const lines = (document.body.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i += 1) {
        rows.push({
          text: lines[i],
          time: /^\d{1,2}:\d{2}:\d{2}$/.test(lines[i - 1] || '') ? lines[i - 1] : '',
          source: 'chat'
        });
      }
    }
    for (const message of Array.isArray(bot.globalState.messages) ? bot.globalState.messages : []) {
      const text = killMessageText(message).trim();
      if (!text) continue;
      rows.push({
        text,
        time: killMessageTime(message),
        source: 'snapshot'
      });
    }
    return rows;
  }

  function recentAttackForKill(victim, t = Date.now()) {
    const maxAge = Math.max(1000, Number(cfg.killChatAttackMatchMs || 120000));
    return bot.attackHistory
      .slice()
      .reverse()
      .find(item => t - Number(item.at || 0) <= maxAge
        && (item.name === victim || String(item.id) === victim)) || null;
  }

  function findLiveKillVictim(victim, id = null) {
    const victimName = String(victim || '').trim();
    const idText = id === undefined || id === null || id === '' ? '' : String(id);
    if (!victimName && !idText) return null;
    const lists = [];
    const nativeEntities = getNativeEntityList();
    if (Array.isArray(nativeEntities)) lists.push({ source: 'native', entities: nativeEntities });
    const currentEntities = getEntities();
    if (Array.isArray(currentEntities) && currentEntities !== nativeEntities) lists.push({ source: 'current', entities: currentEntities });
    if (Array.isArray(bot.globalState?.entities) && bot.globalState.entities !== currentEntities && bot.globalState.entities !== nativeEntities) {
      lists.push({ source: 'snapshot', entities: bot.globalState.entities });
    }
    for (const list of lists) {
      for (const entity of list.entities || []) {
        if (!entity || typeof entity !== 'object') continue;
        const entityId = entity.user_id ?? entity.userId ?? entity.id;
        const entityName = String(entity.name || '').trim();
        const idMatches = Boolean(idText && entityId !== undefined && entityId !== null && String(entityId) === idText);
        const nameMatches = Boolean(victimName && entityName && entityName === victimName);
        if (!idMatches && !nameMatches) continue;
        if (!isAlive(entity)) continue;
        const hp = firstFiniteNumber(entity.hp, entity.knownHp, entity.displayHp, entity.health, entity.currentHp);
        if (Number.isFinite(hp) && hp <= 0) continue;
        return {
          source: list.source,
          id: entityId ?? null,
          name: entityName,
          hp: Number.isFinite(hp) ? hp : null,
          life: entity.life || ''
        };
      }
    }
    return null;
  }

  function updateKillHistory(self) {
    const ownName = self?.name || '';
    if (!ownName) return;
    const rows = collectKillMessageRows();
    for (const row of rows) {
      const match = row.text.match(/^(.+?) killed (.+)$/);
      if (!match || match[1] !== ownName) continue;
      const time = row.time || '';
      const victim = match[2];
      const key = 'chat-kill|' + (row.source || 'chat') + '|' + time + '|' + victim;
      if (bot.seenKillKeys.has(key)) continue;
      const attack = recentAttackForKill(victim);
      const existingIndex = recentKillHistoryIndex(victim, attack?.id ?? null);
      const existing = existingIndex >= 0 ? bot.killHistory[existingIndex] : null;
      if (!attack && !existing) continue;
      const targetDrop = Math.max(0, Math.round(Number(attack ? attack.drop : (existing?.targetDrop ?? existing?.drop ?? 0)) || 0));
      const existingRewardConfirmed = Boolean(existing?.rewardConfirmed || existing?.dropMatched);
      const liveVictim = existingRewardConfirmed ? null : findLiveKillVictim(victim, attack?.id ?? existing?.id ?? null);
      if (liveVictim) {
        bot.importantLogging.lastSkippedChatKill = {
          at: Date.now(),
          victim,
          id: attack?.id ?? existing?.id ?? null,
          reason: 'victim-still-alive',
          liveVictim
        };
        continue;
      }
      const kill = {
        at: Date.now(),
        time,
        victim,
        id: attack ? attack.id : (existing?.id ?? null),
        drop: targetDrop || null,
        targetDrop: targetDrop || null,
        rewardCoins: existingRewardConfirmed ? Math.max(0, Number(existing?.rewardCoins || 0) || 0) : 0,
        reportedRewardCoins: targetDrop || Math.max(0, Number(existing?.reportedRewardCoins ?? existing?.rewardCoins ?? 0) || 0),
        playerCategory: attack ? attack.playerCategory : (existing?.playerCategory ?? ''),
        afk: attack ? attack.afk : (existing?.afk ?? null),
        active: attack ? attack.active : (existing?.active ?? null),
        combat: attack ? attack.combat : (existing?.combat ?? false),
        combatIntent: attack ? attack.combatIntent : (existing?.combatIntent ?? ''),
        mode: attack ? attack.mode : (existing?.mode ?? ''),
        currentlyActive: attack ? attack.currentlyActive : (existing?.currentlyActive ?? false),
        moving: attack ? attack.moving : (existing?.moving ?? false),
        firing: attack ? attack.firing : (existing?.firing ?? false),
        matchedAttack: Boolean(attack || existing?.matchedAttack),
        chatConfirmed: true,
        source: 'chat',
        attackDistance: attack ? attack.distance : (existing?.attackDistance ?? null),
        sessionId: bot.session?.importantSessionId || '',
        coin: existing?.coin || null,
        dropMatched: Boolean(existing?.dropMatched),
        rewardConfirmed: existingRewardConfirmed
      };
      recordKillHistoryItem(kill, key);
    }
  }


  return {
    importantLogDay,
    importantLogId,
    importantLogFileId,
    normalizeImportantLogsStore,
    readImportantLogsStore,
    trimImportantLogsStore,
    writeImportantLogsStore,
    updateImportantLogsStore,
    upsertImportantListItem,
    importantEventAlreadyPending,
    queueImportantLogRemote,
    markImportantLogsRemoteSent,
    markImportantLogsRemoteError,
    recordImportantEvent,
    restoreImportantLogsForRemote,
    importantKillSummary,
    importantKillPlayerCategory,
    importantSessionKills,
    importantSessionRecord,
    upsertImportantSessionRecord,
    startImportantSession,
    closeOpenImportantSessionsBeforeStart,
    importantExitReasonRank,
    noteImportantSessionExit,
    recordImportantKill,
    importantHpValue,
    importantTargetKey,
    importantCombatTargetSummary,
    updateImportantCombatHp,
    importantSessionStaminaSpentMs,
    importantCombatDecisionIsExitOnly,
    importantCombatReasonIsNonCombatSafety,
    importantCombatReasonIsPostCombatObservation,
    importantCombatHasActualEngagement,
    updateImportantCombatStamina,
    importantCombatSampleFromDecision,
    startImportantCombat,
    updateImportantCombatRecord,
    importantCombatMatchesKill,
    importantCombatResult,
    finishImportantCombat,
    recordImportantCombatTick,
    summarizeImportantLoggingStatus,
    attackPlayerCategory,
    rememberAttack,
    killIdentityMatches,
    recentKillHistoryIndex,
    attackIdentityMatches,
    recentAttackBattleSummary,
    recordKillHistoryItem,
    killMessageText,
    killMessageTime,
    collectKillMessageRows,
    recentAttackForKill,
    findLiveKillVictim,
    updateKillHistory
  };
}

module.exports = {
  createImportantLoggingRuntime
};
