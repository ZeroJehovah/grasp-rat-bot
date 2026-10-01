'use strict';

// Called only after this tick's profit selection and drop reconciliation.
// Combat estimation cannot cancel a newly available reward or pending loot.
function buildUncommittedDefenseExitAction(combat, stateful = {}, context = {}) {
  const candidate = combat?.dryRun?.uncommittedDefense;
  if (candidate?.shouldLeave !== true || context.evaluated !== true) return null;
  const settlements = stateful.postKillSettlements;
  const pending = item => item && item.active !== false && item.ownDamageAttribution !== true
    && ['unconfirmed-tail', 'drop-pending', 'drop-visible'].includes(item.phase);
  const pendingSettlements = Object.values(settlements || {}).some(pending);
  const committed = Boolean(
    combat.target?.primaryTargetId
    || stateful.profitMission
    || pending(stateful.postKillSettlement)
    || pendingSettlements
    || stateful.realtimeLootIntent
    || context.profitChoice
    || context.lootAction
    || context.settlementAction
    || context.dropWaitAction
    || combat.dryRun?.shooting?.primaryFinishRace?.active
  );
  if (committed) {
    if (stateful.combatTarget) stateful.combatTarget.uncommittedDefenseState = null;
    return null;
  }
  return {
    kind: 'safety-exit', band: 'safety', shouldLeave: true, stopMotion: true,
    reason: 'uncommitted-defense-poor-exchange-leave', target: combat.target,
    combatExit: {
      ...candidate, policy: 'uncommitted-defense-stop-loss',
      rule: 'sustained-poor-exchange-without-profit'
    }
  };
}

module.exports = { buildUncommittedDefenseExitAction };
