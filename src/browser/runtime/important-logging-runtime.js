'use strict';

const { createImportantSessionRuntime } = require('./important-session-runtime');
const { createKillAttributionRuntime } = require('./kill-attribution-runtime');

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

  const importantSessionRuntime = createImportantSessionRuntime({
    bot,
    cfg,
    storage,
    importantLogsKey,
    queueCombatLogEntry,
    flushCombatLogs,
    combatLogSuspendReason,
    combatLogIsAfkAttack,
    getCurrentUserId,
    pushBounded,
    knownHpValue,
    dropValue
  });

  const killAttributionRuntime = createKillAttributionRuntime({
    bot,
    cfg,
    pushBounded,
    isAfkProfitTarget,
    isCurrentlyActive,
    isMovingThreat,
    isFiringEntity,
    summarizeSelf,
    getNativeEntityList,
    getEntities,
    isAlive,
    firstFiniteNumber,
    importantSessionStaminaSpentMs: importantSessionRuntime.importantSessionStaminaSpentMs,
    importantKillPlayerCategory: importantSessionRuntime.importantKillPlayerCategory,
    recordImportantKill: importantSessionRuntime.recordImportantKill
  });

  return {
    ...importantSessionRuntime,
    ...killAttributionRuntime
  };
}

module.exports = {
  createImportantLoggingRuntime
};
