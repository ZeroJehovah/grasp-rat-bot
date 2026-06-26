'use strict';

function combatLogSource(helpers = {}) {
  const {
    combatLogExitSummaryFromDecision
  } = helpers;
  return String.raw`      function combatLogEntryFailureKey(entry) {
        if (!entry || typeof entry !== 'object') return '';
        return [
          entry.exitAuditLogId || '',
          entry.importantLogId || '',
          entry.combatId || '',
          entry.sequence ?? '',
          entry.type || '',
          entry.at || '',
          entry.source || ''
        ].map(value => String(value ?? '')).join('|');
      }

      function normalizeCombatLogFailedState(state = bot.combatLogging) {
        if (!state || typeof state !== 'object') return 0;
        if (!Array.isArray(state.failedEntryKeys)) state.failedEntryKeys = [];
        if (Number(state.failed || 0) > 0 && !state.failedEntryKeys.length && Array.isArray(state.pending) && state.pending.length) {
          const count = Math.min(state.pending.length, Math.max(0, Math.round(Number(state.failed || 0))));
          state.failedEntryKeys = state.pending.slice(0, count).map(combatLogEntryFailureKey).filter(Boolean);
        }
        if ((!Array.isArray(state.pending) || !state.pending.length) && !state.sending) {
          state.failedEntryKeys = [];
          state.failed = 0;
          return 0;
        }
        state.failedEntryKeys = Array.from(new Set(state.failedEntryKeys.filter(Boolean))).slice(-1000);
        state.failed = state.failedEntryKeys.length;
        return state.failed;
      }

      function markCombatLogEntriesFailed(entries) {
        const state = bot.combatLogging;
        if (!state || !Array.isArray(entries) || !entries.length) return 0;
        const keys = new Set(Array.isArray(state.failedEntryKeys) ? state.failedEntryKeys.filter(Boolean) : []);
        for (const entry of entries) {
          const key = combatLogEntryFailureKey(entry);
          if (key) keys.add(key);
        }
        state.failedEntryKeys = Array.from(keys).slice(-1000);
        state.failed = state.failedEntryKeys.length;
        return state.failed;
      }

      function markCombatLogEntriesSent(entries) {
        const state = bot.combatLogging;
        if (!state || !Array.isArray(entries) || !entries.length) return 0;
        if (!Array.isArray(state.failedEntryKeys) || !state.failedEntryKeys.length) return normalizeCombatLogFailedState(state);
        const sentKeys = new Set(entries.map(combatLogEntryFailureKey).filter(Boolean));
        if (!sentKeys.size) return normalizeCombatLogFailedState(state);
        state.failedEntryKeys = state.failedEntryKeys.filter(key => !sentKeys.has(key));
        return normalizeCombatLogFailedState(state);
      }

      function configureCombatLogging(options = {}) {
        const next = options && typeof options === 'object' ? options : {};
        if (Object.prototype.hasOwnProperty.call(next, 'endpoint')) {
          const endpoint = String(next.endpoint || 'http://127.0.0.1:18765/combat-log');
          cfg.combatLogEndpoint = endpoint;
          cfg.combatLogEndpointConfigured = true;
          bot.combatLogging.endpoint = endpoint;
          bot.combatLogging.endpointConfigured = true;
        }
        if (Object.prototype.hasOwnProperty.call(next, 'enabled')) {
          const enabled = Boolean(next.enabled) && Boolean(cfg.combatLogEndpointConfigured);
          cfg.combatLoggingEnabled = enabled;
          bot.combatLogging.enabled = enabled;
        }
        if (!bot.combatLogging.enabled) {
          bot.combatLogging.active = false;
          bot.combatLogging.combatId = '';
        }
        restoreImportantLogsForRemote();
        if (Array.isArray(bot.combatLogging?.pending) && bot.combatLogging.pending.length) {
          flushCombatLogs(true);
        }
        return summarizeCombatLoggingStatus();
      }

      function summarizeCombatLoggingStatus() {
        const state = bot.combatLogging || {};
        const t = Date.now();
        const exitAuditPending = unresolvedExitAuditLogCount();
        const failed = normalizeCombatLogFailedState(state);
        return {
          enabled: Boolean(state.enabled),
          endpoint: String(state.endpoint || ''),
          endpointConfigured: Boolean(state.endpointConfigured || cfg.combatLogEndpointConfigured),
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
          failed,
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
        if (!state.endpoint) return [];
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

      function pendingImportantSessionEndLogEvents() {
        const state = bot.combatLogging || {};
        if (!state.endpoint) return [];
        const store = readImportantLogsStore();
        return store.events
          .filter(event => event?.importantLogId && event.importantType === 'session-end' && !event.remoteSentAt);
      }

      function importantSessionEndFlushPending() {
        return pendingImportantSessionEndLogEvents().length > 0;
      }

      function importantSessionEndFlushBlockDetail(reason) {
        restoreImportantLogsForRemote();
        flushCombatLogs(true);
        const state = bot.combatLogging || {};
        const pending = pendingImportantSessionEndLogEvents();
        return {
          blocked: true,
          reason: String(reason || ''),
          pending: pending.length,
          pendingIds: pending.map(event => event.importantLogId).slice(0, 12),
          sending: Boolean(state.sending),
          endpoint: String(state.endpoint || cfg.combatLogEndpoint || ''),
          lastError: state.lastError || bot.importantLogging?.lastRemoteError || '',
          lastOkAt: Number(state.lastOkAt || 0)
        };
      }

      function closeCurrentImportantSessionBeforeLogin(reason = 'login-before-session-end') {
        const session = bot.session || {};
        if (!session.startedAt || session.exitAt) return null;
        const t = Number(session.missingSince || 0) || Date.now();
        return noteImportantSessionExit(reason, bot.lastSelf, t, {
          exitSummary: '重新登录前上一局已不可用，按登录前收口'
        });
      }

      function closeCurrentImportantSessionBeforeReload(reason = 'reload') {
        const session = bot.session || {};
        if (!session.startedAt || session.exitAt) return null;
        const t = Number(session.missingSince || 0) || Date.now();
        return noteImportantSessionExit('reload-before-session-end:' + String(reason || 'reload'), bot.lastSelf, t, {
          exitSummary: '刷新页面前上一局已不可用，按刷新前收口'
        });
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
          runtime: combatLogRuntimeSummary(t),
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
          render: Boolean(entity.render || entity.nativeRender),
          realtime: Boolean(entity.realtime || entity.native || entity.render || entity.nativeRender),
          snapshot: Boolean(entity.snapshot),
          combatIntent: entity.combatIntent || '',
          recentlyMoved: Boolean(entity.recentlyMoved)
        };
      }

      function mergeCombatEntitySource(previous, entity) {
        if (!previous) return entity;
        const previousRealtime = Boolean(previous.native || previous.render || previous.realtime);
        const incomingSnapshotOnly = Boolean(entity.snapshot && !entity.native && !entity.render && !entity.realtime);
        if (previousRealtime && incomingSnapshotOnly) {
          return {
            ...entity,
            ...previous,
            snapshot: true,
            native: Boolean(previous.native),
            render: Boolean(previous.render),
            realtime: true,
            hp: previous.hp ?? entity.hp,
            knownHp: previous.knownHp ?? entity.knownHp,
            max_hp: previous.max_hp ?? entity.max_hp,
            maxHp: previous.maxHp ?? entity.maxHp,
            death_reward_preview: previous.death_reward_preview ?? entity.death_reward_preview,
            death_drop_coins: previous.death_drop_coins ?? entity.death_drop_coins,
            drop: previous.drop ?? entity.drop
          };
        }
        return {
          ...previous,
          ...entity,
          native: Boolean(previous.native || entity.native),
          render: Boolean(previous.render || entity.render || entity.nativeRender),
          realtime: Boolean(previous.realtime || entity.realtime || previous.native || entity.native || previous.render || entity.render || entity.nativeRender),
          snapshot: Boolean(previous.snapshot || entity.snapshot)
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
          byId.set(key, mergeCombatEntitySource(byId.get(key), entity));
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

      function combatMetricNumber(value) {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      }

      function combatMetricRound(value) {
        const num = combatMetricNumber(value);
        return num === null ? null : Math.round(num);
      }

      function combatMetricDelta(current, previous) {
        const curr = combatMetricNumber(current);
        const prev = combatMetricNumber(previous);
        if (curr === null || prev === null) return null;
        return Math.round((curr - prev) * 100) / 100;
      }

      function combatMetricEntityId(entity) {
        const id = entity?.id ?? entity?.user_id ?? entity?.targetId;
        return id === undefined || id === null || id === '' ? null : id;
      }

      function combatMetricHp(entity, fallback = null) {
        const values = [
          entity?.hp,
          entity?.knownHp,
          entity?.displayHp,
          entity?.selfHp,
          entity?.targetHp,
          fallback
        ];
        for (const value of values) {
          const num = combatMetricNumber(value);
          if (num !== null) return num;
        }
        return null;
      }

      function combatMetricPoint(entity, fallbackHp = null) {
        if (!entity || typeof entity !== 'object') return null;
        const x = combatMetricNumber(entity.x);
        const y = combatMetricNumber(entity.y);
        const hp = combatMetricHp(entity, fallbackHp);
        const distance = combatMetricNumber(entity.distance);
        const id = combatMetricEntityId(entity);
        if (id === null && x === null && y === null && hp === null && distance === null) return null;
        return {
          id,
          name: entity.name || entity.label || '',
          x: x === null ? null : Math.round(x),
          y: y === null ? null : Math.round(y),
          hp,
          distance: distance === null ? null : Math.round(distance)
        };
      }

      function combatMetricDistance(a, b) {
        if (!a || !b) return null;
        const ax = combatMetricNumber(a.x);
        const ay = combatMetricNumber(a.y);
        const bx = combatMetricNumber(b.x);
        const by = combatMetricNumber(b.y);
        if (ax === null || ay === null || bx === null || by === null) return null;
        return Math.round(Math.hypot(ax - bx, ay - by));
      }

      function combatMetricTarget(decision, nearbyEntities) {
        const target = decision?.target || decision?.combatState?.target || null;
        const targetId = combatMetricEntityId(target);
        const targetName = target?.name || target?.label || '';
        let live = null;
        if (Array.isArray(nearbyEntities)) {
          live = nearbyEntities.find(entity => {
            const id = combatMetricEntityId(entity);
            return targetId !== null && id !== null && String(id) === String(targetId);
          }) || null;
          if (!live && targetName) {
            live = nearbyEntities.find(entity => String(entity?.name || entity?.label || '') === String(targetName)) || null;
          }
        }
        const fallbackHp = combatMetricNumber(decision?.combatState?.targetHp ?? decision?.targetHp ?? null);
        if (live && target) return { ...target, ...live, hp: live.hp ?? live.knownHp ?? target.hp ?? target.knownHp ?? fallbackHp };
        if (live) return { ...live, hp: live.hp ?? live.knownHp ?? fallbackHp };
        if (target) return { ...target, hp: target.hp ?? target.knownHp ?? fallbackHp };
        return null;
      }

      function combatMetricBulletStats(bullets) {
        const laneLimit = Math.max(
          Number(cfg.combatBulletLaneRadius || 0) || 0,
          (Number(cfg.combatBulletHitRadiusCm || 0) || 0) + 500
        );
        let nativeBulletCount = 0;
        let snapshotBulletCount = 0;
        let threatBulletCount = 0;
        let nearestThreat = null;
        for (const bullet of bullets || []) {
          if (bullet?.native) nativeBulletCount += 1;
          if (bullet?.snapshot) snapshotBulletCount += 1;
          const projection = combatMetricNumber(bullet?.projection);
          const laneDistance = combatMetricNumber(bullet?.laneDistance);
          if (projection === null || projection <= 0 || laneDistance === null || laneDistance > laneLimit) continue;
          threatBulletCount += 1;
          const timeToImpactMs = combatMetricNumber(bullet?.timeToImpactMs);
          if (timeToImpactMs === null) continue;
          if (!nearestThreat || timeToImpactMs < nearestThreat.timeToImpactMs) {
            nearestThreat = {
              id: bullet.id ?? null,
              ownerId: bullet.ownerId ?? null,
              timeToImpactMs: Math.round(timeToImpactMs),
              laneDistance: Math.round(laneDistance),
              distance: combatMetricRound(bullet.distance)
            };
          }
        }
        return {
          bulletCount: arrayCount(bullets),
          nativeBulletCount,
          snapshotBulletCount,
          threatBulletCount,
          nearestThreat
        };
      }

      function combatMetricActionSummary(decision, rawSelf, incoming) {
        const combatState = decision?.combatState || {};
        const spacing = combatState.spacing || decision?.spacing || null;
        const pressureClose = combatState.pressureClose || null;
        const shooting = combatState.shooting || decision?.shooting || null;
        const movementSuppressed = combatState.movementSuppressed || decision?.movementSuppressed || null;
        return {
          kind: decision?.kind || '',
          reason: decision?.reason || '',
          dx: combatMetricRound(decision?.dx),
          dy: combatMetricRound(decision?.dy),
          shoot: Boolean(decision?.shoot),
          forceShoot: Boolean(decision?.forceShoot),
          shootEveryMs: combatMetricRound(decision?.shootEveryMs),
          spacingReason: spacing?.reason || '',
          spacingMerged: Boolean(spacing?.merged || spacing?.spacingMerged || combatState?.strafe?.spacingMerged),
          spacingOverrideBullet: Boolean(spacing?.overrideBullet),
          pressureCloseReason: pressureClose?.reason || '',
          shootingReason: shooting?.reason || '',
          shootingSuppressed: Boolean(shooting?.suppressed),
          shootingThrottled: Boolean(shooting?.throttled),
          stamina5s: combatMetricRound(shooting?.stamina5s ?? movementSuppressed?.stamina5s ?? rawSelf?.stamina_5s_remaining_milli),
          movementSuppressedReason: movementSuppressed?.reason || '',
          incomingBulletReason: decision?.incomingBullet?.reason || incoming?.reason || ''
        };
      }

      function combatLogFrameMetrics(rawSelf, selfSummary, decision, nearbyEntities, bullets, incoming, entryAt, perfNow) {
        const selfPoint = combatMetricPoint(selfSummary || rawSelf);
        const targetPoint = combatMetricPoint(combatMetricTarget(decision, nearbyEntities), decision?.combatState?.targetHp);
        const previous = bot.lastCombatLogMetric && typeof bot.lastCombatLogMetric === 'object'
          ? bot.lastCombatLogMetric
          : null;
        const frameDtMs = previous?.at ? Math.max(0, Math.round(entryAt - Number(previous.at || entryAt))) : null;
        const sameTarget = Boolean(previous?.target?.id !== null
          && previous?.target?.id !== undefined
          && targetPoint?.id !== null
          && targetPoint?.id !== undefined
          && String(previous.target.id) === String(targetPoint.id));
        const selfHpDelta = combatMetricDelta(selfPoint?.hp, previous?.self?.hp);
        const targetHpDelta = sameTarget ? combatMetricDelta(targetPoint?.hp, previous?.target?.hp) : null;
        const distanceDelta = sameTarget ? combatMetricDelta(targetPoint?.distance, previous?.target?.distance) : null;
        const shot = bot.lastCombatShot && typeof bot.lastCombatShot === 'object' ? bot.lastCombatShot : null;
        const shotAt = Number(shot?.at || 0);
        const previousAt = Number(previous?.at || 0);
        const shotSincePreviousFrame = Boolean(shotAt && shotAt <= entryAt && (!previousAt || shotAt > previousAt));
        const combatTarget = bot.combatTarget || null;
        const targetDamageAt = combatTarget
          && targetPoint?.id !== null
          && targetPoint?.id !== undefined
          && String(combatTarget.id ?? '') === String(targetPoint.id)
          ? Number(combatTarget.lastDamageAt || 0)
          : 0;
        const serverPositionStall = summarizeServerPositionStall();
        const metrics = {
          frameDtMs,
          selfHpDelta,
          selfDamageTaken: selfHpDelta !== null && selfHpDelta < 0 ? Math.round(Math.abs(selfHpDelta) * 100) / 100 : 0,
          targetHpDelta,
          targetDamageTaken: targetHpDelta !== null && targetHpDelta < 0 ? Math.round(Math.abs(targetHpDelta) * 100) / 100 : 0,
          distanceDelta,
          selfMoveCm: combatMetricDistance(selfPoint, previous?.self),
          targetMoveCm: sameTarget ? combatMetricDistance(targetPoint, previous?.target) : null,
          action: combatMetricActionSummary(decision || {}, rawSelf || selfSummary || null, incoming),
          shots: shot ? {
            lastShotAgeMs: shotAt ? Math.max(0, Math.round(entryAt - shotAt)) : null,
            shotSincePreviousFrame,
            sent: Boolean(shot.sent),
            blockedByCadence: Boolean(shot.blockedByCadence),
            cadenceRemainingMs: combatMetricRound(shot.cadenceRemainingMs),
            shootEveryMs: combatMetricRound(shot.shootEveryMs),
            force: Boolean(shot.force),
            targetId: shot.target?.id ?? null,
            targetName: shot.target?.name || ''
          } : null,
          damage: {
            lastTargetDamageAgeMs: targetDamageAt ? Math.max(0, Math.round(entryAt - targetDamageAt)) : null,
            lastTargetDamageAmount: combatTarget
              && targetPoint?.id !== null
              && targetPoint?.id !== undefined
              && String(combatTarget.id ?? '') === String(targetPoint.id)
              ? combatMetricRound(combatTarget.lastDamageAmount)
              : null,
            noTargetDamageMs: combatTarget
              && targetPoint?.id !== null
              && targetPoint?.id !== undefined
              && String(combatTarget.id ?? '') === String(targetPoint.id)
              ? combatMetricRound(combatTarget.noDamageMs)
              : null
          },
          bullets: combatMetricBulletStats(bullets),
          incomingBullet: incoming ? {
            id: incoming.id ?? null,
            ownerId: incoming.ownerId ?? null,
            distance: combatMetricRound(incoming.distance),
            laneDistance: combatMetricRound(incoming.laneDistance),
            timeToImpactMs: combatMetricRound(incoming.timeToImpactMs),
            reason: incoming.reason || ''
          } : null,
          serverPositionStall: serverPositionStall ? {
            active: Boolean(serverPositionStall.active),
            stalled: Boolean(serverPositionStall.stalled),
            reason: serverPositionStall.reason || '',
            holdRemainingMs: combatMetricRound(serverPositionStall.holdRemainingMs),
            movingMs: combatMetricRound(serverPositionStall.movingMs),
            clientMoved: combatMetricRound(serverPositionStall.clientMoved),
            serverMoved: combatMetricRound(serverPositionStall.serverMoved),
            gap: combatMetricRound(serverPositionStall.gap),
            gapDelta: combatMetricRound(serverPositionStall.gapDelta),
            snapshotAgeMs: combatMetricRound(serverPositionStall.snapshotAgeMs)
          } : null
        };
        bot.lastCombatLogMetric = {
          at: entryAt,
          perfNow,
          combatId: bot.combatLogging?.combatId || '',
          source: decision?.source || '',
          reason: decision?.reason || '',
          self: selfPoint,
          target: targetPoint
        };
        return metrics;
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

      function combatLogRuntimeSummary(entryAt = Date.now(), decision = null) {
        const t = Number.isFinite(Number(entryAt)) ? Number(entryAt) : Date.now();
        const thresholdMs = Math.max(1000, Number(cfg.combatTickGapOfflineMs || 0) || 0);
        const tickGapMs = Number.isFinite(Number(bot.lastTickGapMs))
          ? Math.max(0, Math.round(Number(bot.lastTickGapMs)))
          : null;
        const tickInProgressMs = bot.ticking && bot.lastTickAt
          ? Math.max(0, Math.round(t - Number(bot.lastTickAt || t)))
          : null;
        const lastTickCompletedGapMs = bot.lastTickCompletedAt
          ? Math.max(0, Math.round(t - Number(bot.lastTickCompletedAt || t)))
          : null;
        const combatLogActive = Boolean(bot.combatLogging?.active);
        const queuedCombatFrameAt = Number(bot.combatLogging?.lastQueuedFrameAt || 0) || 0;
        const metricCombatFrameAt = Number(bot.lastCombatLogMetric?.at || 0) || 0;
        const lastCombatFrameAt = queuedCombatFrameAt || (combatLogActive ? metricCombatFrameAt : 0);
        const combatFrameGapMs = lastCombatFrameAt ? Math.max(0, Math.round(t - lastCombatFrameAt)) : null;
        const lastBuiltFrameAt = Number(bot.combatLogging?.lastBuiltFrameAt || 0) || 0;
        const builtFrameGapMs = lastBuiltFrameAt ? Math.max(0, Math.round(t - lastBuiltFrameAt)) : null;
        const lastCombatAt = Number(bot.combatLogging?.lastCombatAt || 0) || 0;
        const combatTriggerGapMs = lastCombatAt ? Math.max(0, Math.round(t - lastCombatAt)) : null;
        const recordedCombatTickGap = bot.lastCombatTickGap || decision?.combatTickGap || decision?.offlineSafety?.combatTickGap || null;
        const recordedDiagnosis = recordedCombatTickGap?.diagnosis || '';
        const decisionCombatActive = combatTickActiveFromState({
          decision,
          combatTarget: bot.combatTarget,
          pendingExit: bot.pendingExit || bot.pendingCombatLeave,
          nowMs: t
        });
        const previousCombatActive = Boolean(bot.previousTickCombatActive);
        const currentCombatActive = Boolean(bot.lastTickCombatActive || decisionCombatActive);
        const recentCombatContextMs = Math.max(
          thresholdMs,
          Number(cfg.combatEngageStickMs || 0),
          Number(cfg.combatEngageGraceMs || 0),
          Number(cfg.combatLogPostBufferMs || 0)
        );
        const recentCombatFrameContext = Boolean(lastCombatFrameAt
          && recentCombatContextMs > 0
          && t - lastCombatFrameAt <= recentCombatContextMs);
        const activeCombatContext = previousCombatActive || currentCombatActive || combatLogActive || recentCombatFrameContext || Boolean(recordedCombatTickGap);
        const reentryGapOverThreshold = Boolean(activeCombatContext
          && (recordedDiagnosis === 'tick-reentry-gap' || decision?.tickReentry)
          && thresholdMs > 0
          && ((tickInProgressMs !== null && tickInProgressMs >= thresholdMs)
            || (lastTickCompletedGapMs !== null && lastTickCompletedGapMs >= thresholdMs)));
        const tickGapOverThreshold = Boolean(activeCombatContext && tickGapMs !== null && thresholdMs > 0 && tickGapMs >= thresholdMs);
        const combatFrameGapOverThreshold = Boolean(activeCombatContext && combatFrameGapMs !== null && thresholdMs > 0 && combatFrameGapMs >= thresholdMs);
        const diagnosis = recordedDiagnosis || (reentryGapOverThreshold
          ? 'tick-reentry-gap'
          : (tickGapOverThreshold
            ? 'main-loop-gap'
            : (combatFrameGapOverThreshold ? 'combat-log-gap-with-active-tick' : 'normal')));
        return {
          thresholdMs,
          tickGapMs,
          tickInProgressMs,
          lastTickCompletedGapMs,
          reentryGapOverThreshold,
          tickGapOverThreshold,
          previousTickAt: Number(bot.previousTickAt || 0) || 0,
          currentTickAt: Number(bot.lastTickAt || 0) || 0,
          lastTickCompletedAt: Number(bot.lastTickCompletedAt || 0) || 0,
          previousTickSource: bot.previousTickSource || '',
          currentTickSource: bot.lastTickSource || '',
          previousCombatActive,
          currentCombatActive,
          decisionCombatActive,
          combatLogActive,
          recentCombatFrameContext,
          recentCombatContextMs,
          activeCombatContext,
          queuedCombatFrameAt,
          metricCombatFrameAt,
          lastCombatFrameAt,
          combatFrameGapMs,
          combatFrameGapOverThreshold,
          lastBuiltFrameAt,
          builtFrameGapMs,
          lastCombatAt,
          combatTriggerGapMs,
          diagnosis,
          likelyCause: recordedCombatTickGap?.likelyCause || (diagnosis === 'tick-reentry-gap'
            ? 'main-loop-stuck-or-awaiting-async'
            : diagnosis === 'main-loop-gap'
            ? 'js-or-main-loop-paused'
            : (diagnosis === 'combat-log-gap-with-active-tick' ? 'combat-state-or-log-gating-gap' : '')),
          combatTickGap: recordedCombatTickGap
        };
      }

      const combatLogExitSummaryFromDecision = ${combatLogExitSummaryFromDecision.toString()};

      function combatLogExitSummary(decision) {
        return combatLogExitSummaryFromDecision(decision);
      }

      function buildCombatLogEntry(source, decision) {
        const entryAt = Date.now();
        const perfNow = Math.round(now());
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
        const runtime = combatLogRuntimeSummary(entryAt, decision || {});
        bot.combatLogging.lastBuiltFrameAt = entryAt;
        const combatMetrics = combatLogFrameMetrics(rawSelf, self, decision || {}, nearbyEntities, bullets, incoming, entryAt, perfNow);
        return {
          type: 'combat-frame',
          at: entryAt,
          perfNow,
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
          runtime,
          globalState: combatLogGlobalStateSummary(),
          exit,
          login,
          enemyExit: combatLogEnemyExitSummary(),
          combatMetrics,
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
        if (/^(paused|cloudflare-error-refresh|no-self|not-alive|auto-login|manual-login|login-suppressed|login-cooldown|login-snapshot-gate|login-control-missing|session-mismatch-recovery|game-session-connecting|exit-log-flush-pending|important-log-flush-pending)$/.test(reason)) return reason;
	        if (/^(enemy-leave-wait|pursuit-leave-wait|offline-leave-wait)$/.test(reason)) return reason;
		        if (/^(offline-leave|control-ws-offline|control-ws-offline-unsafe|control-ws-offline-safe-wait|control-ws-reconnect-churn|control-ws-no-self-game-session|control-ws-server-position-stalled|control-global-sampling-outage|control-combat-tick-gap|control-stamina-exhausted|stamina-exhausted-leave)$/.test(reason)) return reason;
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
        const important = Boolean(options.important || snapshot.importantLog || snapshot.type === 'important-log');
        if ((!state.enabled && !critical && !important) || !state.endpoint) return false;
        if (!Array.isArray(state.pending)) state.pending = [];
        const queued = {
          ...snapshot,
          combatId: important ? (snapshot.combatId || entry.combatId || state.combatId || '') : (state.combatId || snapshot.combatId || entry.combatId || ''),
          sequence: ++state.sequence,
          criticalLog: Boolean(snapshot.criticalLog || critical),
          importantLog: Boolean(snapshot.importantLog || important)
        };
        if (critical && !queued.exitAuditLogId) {
          queued.exitAuditLogId = 'critical:' + queued.type + ':' + queued.at + ':' + queued.sequence;
        }
        state.pending.push(queued);
        if (queued.type === 'combat-frame') {
          state.lastQueuedFrameAt = Number(queued.at || Date.now()) || Date.now();
        }
        if (queued.exitAuditLogId) {
          if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
          if (!state.pendingExitAuditIds.includes(queued.exitAuditLogId)) state.pendingExitAuditIds.push(queued.exitAuditLogId);
          persistExitAuditLogEntry(queued);
        }
        const maxPending = Math.max(50, Number(cfg.combatLogMaxPendingEntries) || 1000);
        while (state.pending.length > maxPending) {
          const dropIndex = state.pending.findIndex(item => !item?.criticalLog && !item?.exitAuditLogId && !item?.importantLog);
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
          runtime: entry.runtime || null,
          login: entry.login || null,
          combatMetrics: entry.combatMetrics || null,
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
          runtime: entry?.runtime || null,
          login: entry?.login || null,
          combatMetrics: entry?.combatMetrics || null,
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
        const hasImportant = Array.isArray(state?.pending) && state.pending.some(entry => entry?.importantLog || entry?.type === 'important-log');
        if ((!state?.enabled && !hasCritical && !hasImportant) || !state.endpoint || state.sending) return false;
        if (!Array.isArray(state.pending) || !state.pending.length) return false;
        const t = Date.now();
        if (!force && t - Number(state.lastFlushAt || 0) < Math.max(250, Number(cfg.combatLogFlushMs) || 1000)) return false;
        if (typeof fetch !== 'function') {
          state.lastError = 'fetch unavailable';
          markCombatLogEntriesFailed(state.pending);
          return false;
        }
        state.lastFlushAt = t;
        const batchSize = force
          ? Math.min(state.pending.length, Math.max(1, Number(cfg.combatLogBatchMaxEntries) || 50) * 4)
          : Math.max(1, Number(cfg.combatLogBatchMaxEntries) || 50);
        const entries = state.pending.splice(0, batchSize);
        const exitAuditIds = entries.map(entry => entry?.exitAuditLogId).filter(Boolean);
        const importantLogIds = entries.map(entry => entry?.importantLogId).filter(Boolean);
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
            markCombatLogEntriesSent(entries);
            if (exitAuditIds.length) removePersistedExitAuditLogs(exitAuditIds);
            if (importantLogIds.length) markImportantLogsRemoteSent(importantLogIds, state.lastOkAt);
          })
          .catch(err => {
            markCombatLogEntriesFailed(entries);
            state.lastError = err?.message || String(err);
            if (importantLogIds.length) markImportantLogsRemoteError(importantLogIds, state.lastError, Date.now());
            state.pending = entries.concat(Array.isArray(state.pending) ? state.pending : []);
            if (exitAuditIds.length) {
              if (!Array.isArray(state.pendingExitAuditIds)) state.pendingExitAuditIds = [];
              for (const id of exitAuditIds) {
                if (!state.pendingExitAuditIds.includes(id)) state.pendingExitAuditIds.push(id);
              }
            }
            const maxPending = Math.max(50, Number(cfg.combatLogMaxPendingEntries) || 1000);
            while (state.pending.length > maxPending) {
              const dropIndex = state.pending.findIndex(item => !item?.criticalLog && !item?.exitAuditLogId && !item?.importantLog);
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
          flushCombatLogs(false);
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
`;
}

module.exports = {
  combatLogSource
};
