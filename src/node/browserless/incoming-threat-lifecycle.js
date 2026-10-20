'use strict';

const LIMIT = 32;
function idOf(bullet = {}) {
  return String(bullet.bullet_id ?? bullet.bulletId ?? bullet.id ?? '');
}
function observeIncomingThreatLifecycle(records = {}, bullets = [], tick, atMs) {
  for (const bullet of bullets) {
    const id = idOf(bullet);
    if (!id) continue;
    const createdTick = bullet.createdTick ?? bullet.created_tick ?? null;
    const previous = records[id];
    const record = previous && previous.createdTick === createdTick ? previous : {
      id, createdTick, firstShotEventTick: bullet.firstShotEventTick ?? createdTick,
      firstReceivedTick: bullet.firstReceivedTick ?? tick,
      firstRetainedTick: bullet.firstRetainedTick ?? tick,
      firstThreatEligibleTick: null, firstDodgeCommandTick: null,
      expectedEffectiveTick: null, impactTick: null, impactAuthority: 'unknown',
      firstNoSafeTick: null, lastSafeTick: null,
      shotEventTimeAuthority: createdTick === null ? 'unknown' : 'server-created-tick'
    };
    record.lastSeenAtMs = atMs;
    record.lastSeenTick = tick;
    records[id] = record;
  }
  for (const [id, record] of Object.entries(records)) {
    if (atMs - record.lastSeenAtMs > 2500) delete records[id];
  }
  const ordered = Object.values(records).sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs);
  for (const record of ordered.slice(LIMIT)) delete records[record.id];
  return records;
}
function recordIncomingThreatAssessment(records, assessment) {
  if (!assessment) return;
  const tick = assessment.tick;
  const safe = assessment.cover && Number(assessment.cover.physicalHits) === 0
    && Number(assessment.cover.robustHits) === 0;
  for (const bullet of assessment.bullets || []) {
    const record = records[idOf(bullet)];
    if (!record) continue;
    record.firstThreatEligibleTick ??= tick;
    if (safe) record.lastSafeTick = tick;
    else if (assessment.cover) record.firstNoSafeTick ??= tick;
  }
}
function recordIncomingDodgeCommand(records, assessment, command) {
  if (!assessment || !command || command.type !== 'velocity') return;
  const telemetry = command.movementTelemetry || command;
  for (const bullet of assessment.bullets || []) {
    const record = records[idOf(bullet)];
    if (!record) continue;
    record.firstDodgeCommandTick ??= telemetry.observedTick ?? assessment.tick;
    record.expectedEffectiveTick ??= telemetry.expectedEffectiveTick ?? null;
  }
}
function recordIncomingImpact(records, attribution) {
  const record = records[String(attribution?.bulletId || '')];
  if (!record || !attribution?.matched) return;
  record.impactTick ??= attribution.damageTick;
  record.impactAuthority = 'attributed-hp-loss';
}
function incomingLifecycleSummary(records, bullets) {
  return (bullets || []).slice(0, LIMIT).map(bullet => {
    const record = records[idOf(bullet)];
    return record ? { ...bullet, ...record } : { ...bullet, lifecycleEvidence: 'data-insufficient' };
  });
}
module.exports = { observeIncomingThreatLifecycle, recordIncomingThreatAssessment,
  recordIncomingDodgeCommand, recordIncomingImpact, incomingLifecycleSummary };
