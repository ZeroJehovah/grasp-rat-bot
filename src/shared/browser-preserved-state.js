'use strict';

function buildBrowserPreservedState(previousBot) {
  return {
    attackHistory: Array.isArray(previousBot?.attackHistory) ? previousBot.attackHistory.slice(-80) : [],
    killHistory: Array.isArray(previousBot?.killHistory) ? previousBot.killHistory.slice(-40) : [],
    seenKillKeys: Array.isArray(previousBot?.seenKillKeysList) ? previousBot.seenKillKeysList.slice(-120) : [],
    session: previousBot?.session && typeof previousBot.session === 'object' ? { ...previousBot.session } : null,
    lastSelf: previousBot?.lastSelf && typeof previousBot.lastSelf === 'object' ? { ...previousBot.lastSelf } : null,
    lastNativeCoinSnapshot: Array.isArray(previousBot?.lastNativeCoinSnapshot) ? previousBot.lastNativeCoinSnapshot.slice(-160) : [],
    combatTarget: previousBot?.combatTarget && typeof previousBot.combatTarget === 'object' ? { ...previousBot.combatTarget } : null,
    combatRetreatIgnore: previousBot?.combatRetreatIgnore instanceof Map ? new Map(previousBot.combatRetreatIgnore) : new Map(),
    combatAim: previousBot?.combatAim && typeof previousBot.combatAim === 'object' ? { ...previousBot.combatAim } : null,
    combatDisadvantageObservation: previousBot?.combatDisadvantageObservation && typeof previousBot.combatDisadvantageObservation === 'object' ? { ...previousBot.combatDisadvantageObservation } : null,
    lastCombatLogMetric: previousBot?.lastCombatLogMetric && typeof previousBot.lastCombatLogMetric === 'object' ? { ...previousBot.lastCombatLogMetric } : null,
    lastCombatShot: previousBot?.lastCombatShot && typeof previousBot.lastCombatShot === 'object' ? { ...previousBot.lastCombatShot } : null,
    opportunityChoice: previousBot?.opportunityChoice && typeof previousBot.opportunityChoice === 'object' ? { ...previousBot.opportunityChoice } : null,
    opportunitySwitchLock: previousBot?.opportunitySwitchLock && typeof previousBot.opportunitySwitchLock === 'object' ? { ...previousBot.opportunitySwitchLock } : null,
    opportunityAfkStamina: previousBot?.opportunityAfkStamina instanceof Map ? new Map(previousBot.opportunityAfkStamina) : new Map(),
    targetSwitchDiagnostics: previousBot?.targetSwitchDiagnostics && typeof previousBot.targetSwitchDiagnostics === 'object'
      ? {
        ...previousBot.targetSwitchDiagnostics,
        events: Array.isArray(previousBot.targetSwitchDiagnostics.events) ? previousBot.targetSwitchDiagnostics.events.slice(-24) : []
      }
      : null,
    finalActionArbitration: previousBot?.finalActionArbitration && typeof previousBot.finalActionArbitration === 'object'
      ? {
        ...previousBot.finalActionArbitration,
        history: Array.isArray(previousBot.finalActionArbitration.history) ? previousBot.finalActionArbitration.history.slice(-24) : []
      }
      : null,
    chaseMode: previousBot?.chaseMode && typeof previousBot.chaseMode === 'object'
      ? {
        ...previousBot.chaseMode,
        targets: Array.isArray(previousBot.chaseMode.targets) ? previousBot.chaseMode.targets.slice(-20) : [],
        lastClear: previousBot.chaseMode.lastClear && typeof previousBot.chaseMode.lastClear === 'object' ? { ...previousBot.chaseMode.lastClear } : null,
        lastDecision: previousBot.chaseMode.lastDecision && typeof previousBot.chaseMode.lastDecision === 'object' ? { ...previousBot.chaseMode.lastDecision } : null
      }
      : null,
    pendingExit: previousBot?.pendingExit && typeof previousBot.pendingExit === 'object' ? { ...previousBot.pendingExit } : null,
    lastLoginAt: Number(previousBot?.lastLoginAt || 0) || 0,
    lastLoginResult: previousBot?.lastLoginResult && typeof previousBot.lastLoginResult === 'object' ? { ...previousBot.lastLoginResult } : null,
    lastManualLoginResult: previousBot?.lastManualLoginResult && typeof previousBot.lastManualLoginResult === 'object' ? { ...previousBot.lastManualLoginResult } : null,
    exitAudit: previousBot?.exitAudit && typeof previousBot.exitAudit === 'object' ? { ...previousBot.exitAudit } : null,
    importantLogging: previousBot?.importantLogging && typeof previousBot.importantLogging === 'object'
      ? {
        ...previousBot.importantLogging,
        activeCombat: previousBot.importantLogging.activeCombat && typeof previousBot.importantLogging.activeCombat === 'object'
          ? { ...previousBot.importantLogging.activeCombat }
          : null,
        queuedRemoteIds: Array.isArray(previousBot.importantLogging.queuedRemoteIds)
          ? previousBot.importantLogging.queuedRemoteIds.slice(-500)
          : []
      }
      : null,
    loginSnapshotGate: previousBot?.loginSnapshotGate && typeof previousBot.loginSnapshotGate === 'object' ? { ...previousBot.loginSnapshotGate } : null,
    loginPointSafety: previousBot?.loginPointSafety && typeof previousBot.loginPointSafety === 'object' ? { ...previousBot.loginPointSafety } : null,
    leave403SnapshotRecovery: previousBot?.leave403SnapshotRecovery && typeof previousBot.leave403SnapshotRecovery === 'object' ? { ...previousBot.leave403SnapshotRecovery } : null,
    clashLeaveRescue: previousBot?.clashLeaveRescue && typeof previousBot.clashLeaveRescue === 'object'
      ? {
        ...previousBot.clashLeaveRescue,
        attempts: Array.isArray(previousBot.clashLeaveRescue.attempts) ? previousBot.clashLeaveRescue.attempts.slice(-8) : []
      }
      : null,
    postLoginZoom: previousBot?.postLoginZoom && typeof previousBot.postLoginZoom === 'object' ? { ...previousBot.postLoginZoom } : null,
    targetWhitelist: previousBot?.targetWhitelist && typeof previousBot.targetWhitelist === 'object'
      ? {
        url: String(previousBot.targetWhitelist.url || ''),
        names: Array.isArray(previousBot.targetWhitelist.names) ? previousBot.targetWhitelist.names.slice(-100) : [],
        lastOkAt: Number(previousBot.targetWhitelist.lastOkAt || 0) || 0
      }
      : null,
    combatLogging: previousBot?.combatLogging && typeof previousBot.combatLogging === 'object'
      ? {
        ...previousBot.combatLogging,
        preBuffer: Array.isArray(previousBot.combatLogging.preBuffer) ? previousBot.combatLogging.preBuffer.slice(-160) : [],
        pending: Array.isArray(previousBot.combatLogging.pending) ? previousBot.combatLogging.pending.slice(-1000) : []
      }
      : null,
    coinFailures: previousBot?.coinFailures instanceof Map ? Array.from(previousBot.coinFailures.entries()).slice(-120) : []
  };
}

module.exports = {
  buildBrowserPreservedState
};
