'use strict';

function promoteRankedPlayerDeaths(events, { highDropPlayerTracker, easyKillPlayerTracker, selfUserId, observedAtMs, source }) {
  let promoted = 0;
  for (const event of events || []) {
    const id = event?.victimUserId;
    const occurredAtMs = event?.occurredAtMs;
    if (id === null || id === undefined || !Number.isFinite(Number(id))
      || String(id) === String(selfUserId) || !Number.isFinite(occurredAtMs)) continue;
    // Match the page's retained daily ranking, not the post-death current Drop.
    const player = highDropPlayerTracker.rankedPlayerForDeath?.(id, occurredAtMs, observedAtMs);
    if (!player) continue;
    const result = easyKillPlayerTracker.promoteRankedDeath(player, {
      atMs: observedAtMs, occurredAtMs, evidenceKey: event.key, tick: event.tick,
      killerUserId: event.killerUserId, source
    });
    if (result.promoted) promoted += 1;
  }
  return { promoted };
}

module.exports = { promoteRankedPlayerDeaths };
