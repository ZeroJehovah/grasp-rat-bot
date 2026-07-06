'use strict';

function createKillAttributionRuntime(runtime = {}) {
  const {
    bot,
    cfg,
    pushBounded = (list, item, max) => {
      if (!Array.isArray(list)) return;
      list.push(item);
      while (list.length > max) list.shift();
    },
    isAfkProfitTarget = () => false,
    isCurrentlyActive = () => false,
    isMovingThreat = () => false,
    isFiringEntity = () => false,
    summarizeSelf = value => value,
    getNativeEntityList = () => [],
    getEntities = () => [],
    isAlive = () => false,
    firstFiniteNumber = (...values) => values.find(value => Number.isFinite(Number(value))),
    importantSessionStaminaSpentMs = () => 0,
    importantKillPlayerCategory = () => 'unknown',
    recordImportantKill = () => null
  } = runtime;

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
    const chaseModeSource = action?.chaseMode || target.chaseMode || null;
    const chaseMode = chaseModeSource
      ? {
        targetId: String(chaseModeSource.targetId ?? targetId ?? ''),
        name: String(chaseModeSource.name || targetName || ''),
        drop: Number(chaseModeSource.drop ?? target.drop ?? 0) || 0,
        source: String(chaseModeSource.source || target.source || ''),
        reason: String(chaseModeSource.reason || action?.reason || '')
      }
      : null;
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
      chase: Boolean(chaseMode),
      chaseMode,
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
  createKillAttributionRuntime
};
