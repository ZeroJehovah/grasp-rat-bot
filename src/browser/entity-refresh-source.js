'use strict';

function entityRefreshSource() {
  const recordRuntimeDiagnosticsCall = values => `recordRuntimeDiagnosticsCore(bot, ${values})`;
  return String.raw`  function markRecentMovement(entities) {
    const t = now();
    const sampleMs = Math.max(1, Number(cfg.combatAimMotionSampleMs || 50));
    const decayMs = Math.max(sampleMs, Number(cfg.combatAimRecentMotionDecayMs || 900));
    for (const entity of entities) {
      const id = Number(entity.user_id);
      if (!id) continue;
      const x = Number(entity.x);
      const y = Number(entity.y);
      const previous = bot.seenEntities.get(id);
      let movedAt = previous?.movedAt || 0;
      let activityAt = previous?.activityAt || 0;
      let motionSampleSpeed = 0;
      let motionObservedSpeed = 0;
      const currentSpeed = speed(entity);
      const firing = isFiringEntity(entity);
      const stamina5s = Number(entity?.stamina_5s_remaining_milli ?? entity?.stamina5s ?? entity?.stamina_5s ?? NaN);
      const previousStamina = Number(previous?.stamina5s);
      const staminaDropThreshold = Math.max(0, Number(cfg.opportunityAfkStaminaDropThresholdMs || 100) || 100);
      if (previous
        && Number.isFinite(x)
        && Number.isFinite(y)
        && Number.isFinite(Number(previous.x))
        && Number.isFinite(Number(previous.y))) {
        const elapsedMs = Math.max(sampleMs, t - Number(previous.seenAt || t));
        const delta = Math.hypot(x - Number(previous.x), y - Number(previous.y));
        motionSampleSpeed = delta * sampleMs / elapsedMs;
        const retained = Math.max(0, Number(previous.motionObservedSpeed || 0)) * Math.max(0, 1 - elapsedMs / decayMs);
        motionObservedSpeed = Math.max(motionSampleSpeed, retained);
        if (delta >= cfg.activeMoveMin) {
          movedAt = t;
          activityAt = t;
        }
      }
      if (!previous && (Math.abs(Number(entity.vx) || 0) || Math.abs(Number(entity.vy) || 0))) {
        movedAt = t;
        activityAt = t;
      }
      if (currentSpeed >= cfg.activeSpeedMin || firing) activityAt = t;
      if (Number.isFinite(stamina5s) && Number.isFinite(previousStamina) && stamina5s + staminaDropThreshold < previousStamina) activityAt = t;
      const motionAgeMs = movedAt ? Math.max(0, t - movedAt) : null;
      const recentActivityAgeMs = activityAt ? Math.max(0, t - activityAt) : null;
      const afkCooldownMs = Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0);
      entity.motionSampleSpeed = motionSampleSpeed;
      entity.motionObservedSpeed = motionObservedSpeed;
      entity.motionAgeMs = motionAgeMs;
      entity.recentActivityAgeMs = recentActivityAgeMs;
      entity.recentlyActive = Boolean(recentActivityAgeMs !== null && recentActivityAgeMs <= afkCooldownMs);
      entity.recentlyMoved = Boolean(movedAt && t - movedAt <= cfg.activeSeenMs);
      bot.seenEntities.set(id, {
        x,
        y,
        seenAt: t,
        movedAt,
        activityAt,
        motionSampleSpeed,
        motionObservedSpeed,
        stamina5s: Number.isFinite(stamina5s) ? stamina5s : (Number.isFinite(previousStamina) ? previousStamina : null)
      });
    }
    const seenTtlMs = Math.max(10000, Math.max(0, Number(cfg.afkRecentActivityCooldownMs || 0) || 0) + 2000);
    for (const [id, seen] of bot.seenEntities.entries()) {
      if (t - seen.seenAt > seenTtlMs) bot.seenEntities.delete(id);
    }
  }

	  async function refreshGlobalState(force = false) {
	    const t = Date.now();
	    if (!force && t - bot.globalState.refreshedAt < cfg.globalRefreshMs) return;
	    bot.globalState.refreshedAt = t;
	    bot.globalState.activeRefreshSkippedAt = t;
	    bot.globalState.minimap = null;
	    bot.globalState.error = '';
	    bot.globalState.samplingOutage = null;
	    const completedAt = Date.now();
	    const refreshDiagnostic = {
	      startedAt: t,
	      completedAt,
	      durationMs: 0,
	      force: Boolean(force),
	      skipped: 'passive-snapshot-only-active-game-api-disabled',
	      snapshot: { ok: false, skipped: true, error: '' },
	      minimap: { ok: false, skipped: true, error: '' },
	      error: bot.globalState.error
	    };
	    ${recordRuntimeDiagnosticsCall('{ lastRefresh: refreshDiagnostic }')};
	  }

`;
}

module.exports = {
  entityRefreshSource
};
