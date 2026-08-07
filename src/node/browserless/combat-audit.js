'use strict';

// Compact, allowlisted combat diagnostics. This module consumes already
// summarized realtime decision data; it never reads snapshot input or changes
// action authority.

const COMBAT_AUDIT_VERSION = 1;
const MAX_AUDIT_TEXT = 64;
const MAX_AUDIT_LIST = 8;
const MAX_AUDIT_TRANSITIONS = 16;

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedText(value, fallback = '') {
  const text = String(value == null ? fallback : value);
  return text.length > MAX_AUDIT_TEXT ? text.slice(0, MAX_AUDIT_TEXT) : text;
}

function scalarPolicy(value, fallback = '') {
  if (value === null || value === undefined || value === '') return boundedText(fallback);
  if (typeof value !== 'object') return boundedText(value, fallback);
  for (const key of ['effectivePolicy', 'committedPolicy', 'candidatePolicy', 'name']) {
    const candidate = value[key];
    if (candidate !== null && candidate !== undefined && typeof candidate !== 'object') {
      const text = boundedText(candidate);
      if (text) return text;
    }
  }
  return boundedText(fallback || 'unknown');
}

function boundedList(values, limit = MAX_AUDIT_LIST) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => boundedText(value))
    .filter(Boolean))].slice(0, limit);
}

function targetId(target) {
  const id = target?.userId ?? target?.user_id ?? target?.entityId ?? target?.entity_id ?? target?.id;
  return id === null || id === undefined || id === '' ? '' : String(id);
}

function compactTarget(target) {
  if (!target || typeof target !== 'object') return null;
  return {
    id: targetId(target),
    name: boundedText(target.name),
    authority: boundedText(target.authority || 'realtime'),
    active: target.active === null || target.active === undefined ? null : Boolean(target.active),
    firing: Boolean(target.firing),
    moving: Boolean(target.moving),
    hp: numberOrNull(target.hp),
    maxHp: numberOrNull(target.maxHp ?? target.max_hp),
    distance: numberOrNull(target.distance),
    x: numberOrNull(target.x),
    y: numberOrNull(target.y)
  };
}

function compactCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  return {
    priorityBand: boundedText(candidate.priorityBand),
    hardGate: Boolean(candidate.hardGate),
    targetKey: boundedText(candidate.targetKey),
    switchReason: boundedText(candidate.switchReason),
    order: numberOrNull(candidate.order),
    commitmentRank: numberOrNull(candidate.commitmentRank),
    roiScore: numberOrNull(candidate.roiScore),
    netROI: numberOrNull(candidate.netROI),
    riskScore: numberOrNull(candidate.riskScore),
    staminaCost: numberOrNull(candidate.staminaCost)
  };
}

function compactAction(action) {
  if (!action || typeof action !== 'object') return null;
  return {
    kind: boundedText(action.kind),
    band: boundedText(action.band),
    reason: boundedText(action.reason),
    targetId: targetId(action.target),
    shouldLeave: Boolean(action.shouldLeave),
    stopMotion: Boolean(action.stopMotion),
    urgent: Boolean(action.urgent),
    finalCandidate: compactCandidate(action.finalCandidate),
    arbitration: action.finalActionArbitration
      ? {
          mode: boundedText(action.finalActionArbitration.mode),
          reason: boundedText(action.finalActionArbitration.reason),
          holdRemainingMs: numberOrNull(action.finalActionArbitration.holdRemainingMs),
          from: boundedText(action.finalActionArbitration.from?.key),
          to: boundedText(action.finalActionArbitration.to?.key)
        }
      : null,
    targetSwitch: action.targetSwitch
      ? {
          type: boundedText(action.targetSwitch.type),
          oscillating: Boolean(action.targetSwitch.oscillating),
          pairSwitchCount: numberOrNull(action.targetSwitch.pairSwitchCount),
          from: boundedText(action.targetSwitch.from?.key),
          to: boundedText(action.targetSwitch.to?.key)
        }
      : null
  };
}

function buildCombatAudit(summary = {}) {
  const root = summary && typeof summary === 'object' ? summary : {};
  const combat = root.combat && typeof root.combat === 'object' ? root.combat : {};
  const target = compactTarget(combat.target);
  const shooting = combat.shooting && typeof combat.shooting === 'object' ? combat.shooting : {};
  const metrics = combat.metrics && typeof combat.metrics === 'object' ? combat.metrics : {};
  const behavior = combat.behavior && typeof combat.behavior === 'object' ? combat.behavior : {};
  const action = root.action || null;
  const desiredAction = {
    kind: shooting.wouldShoot ? 'shoot' : (combat.exit?.shouldLeave ? 'leave' : ''),
    band: combat.exit?.shouldLeave ? 'exit' : (target ? 'combat' : ''),
    reason: boundedText(shooting.wouldShoot
      ? (shooting.reason || 'fire-authorized')
      : (shooting.finalFireBlocker || shooting.reason || combat.exit?.reason || '')),
    targetId: target?.id || '',
    wouldShoot: Boolean(shooting.wouldShoot)
  };
  const hardBlockers = [];
  const advisoryBlockers = [];
  if (shooting.finalFireBlocker && shooting.finalFireBlocker !== 'none') hardBlockers.push(shooting.finalFireBlocker);
  if (combat.exit?.shouldLeave && combat.exit.reason) hardBlockers.push(combat.exit.reason);
  if (combat.contactEntryGuard?.reason) hardBlockers.push(combat.contactEntryGuard.reason);
  advisoryBlockers.push(...(shooting.advisoryCadenceReasons || []));
  advisoryBlockers.push(...(shooting.advisoryFireSuppressionReasons || []));
  const responsePolicy = scalarPolicy(behavior.responsePolicy || shooting.responsePolicy, 'unknown');
  if (behavior.responsePolicy || shooting.responsePolicy) advisoryBlockers.push(`response-policy:${responsePolicy}`);
  const switchDiagnostic = combat.combatTargetSwitch || action?.targetSwitch || null;
  return {
    version: COMBAT_AUDIT_VERSION,
    at: boundedText(root.at),
    tick: numberOrNull(root.tick ?? combat.tick),
    authority: boundedText(target?.authority || combat.authority || 'realtime'),
    authorityIsRealtime: (target?.authority || combat.authority || 'realtime') === 'realtime',
    target,
    mode: boundedText(behavior.mode || combat.combatPhase?.phase),
    policy: responsePolicy,
    modeTransitionReason: boundedText(behavior.transitionReason),
    policyReason: boundedText(behavior.behaviorReason || shooting.behaviorReason),
    firstEligibleAt: numberOrNull(metrics.firstEligibleAt),
    lastEligibleAt: numberOrNull(metrics.lastEligibleAt),
    desiredAction,
    finalAction: compactAction(action),
    finalSelection: compactCandidate(root.finalSelection?.selected),
    arbitration: action?.finalActionArbitration
      ? {
          mode: boundedText(action.finalActionArbitration.mode),
          reason: boundedText(action.finalActionArbitration.reason),
          holdRemainingMs: numberOrNull(action.finalActionArbitration.holdRemainingMs),
          from: boundedText(action.finalActionArbitration.from?.key),
          to: boundedText(action.finalActionArbitration.to?.key)
        }
      : null,
    targetSwitch: switchDiagnostic
      ? {
          type: boundedText(switchDiagnostic.type),
          oscillating: Boolean(switchDiagnostic.oscillating),
          pairSwitchCount: numberOrNull(switchDiagnostic.pairSwitchCount),
          from: boundedText(switchDiagnostic.from?.key),
          to: boundedText(switchDiagnostic.to?.key)
        }
      : null,
    blockers: {
      hard: boundedList(hardBlockers),
      advisory: boundedList(advisoryBlockers)
    },
    shooting: {
      wouldShoot: Boolean(shooting.wouldShoot),
      commandSuppressed: Boolean(shooting.commandSuppressed),
      finalFireBlocker: boundedText(shooting.finalFireBlocker),
      fireAuthorizationClass: boundedText(shooting.fireAuthorizationClass),
      cadenceMs: numberOrNull(shooting.executionCadenceMs ?? shooting.cadenceMs),
      advisoryCadenceMs: numberOrNull(shooting.advisoryCadenceMs),
      reserve: numberOrNull(shooting.reserve),
      dodgeReserveMs: numberOrNull(shooting.dodgeReserveMs),
      hardReserveMs: numberOrNull(shooting.hardReserveMs),
      stamina5s: numberOrNull(shooting.stamina5s),
      requiredStaminaMs: numberOrNull(shooting.requiredStaminaMs)
    },
    movement: combat.movement && typeof combat.movement === 'object'
      ? {
          dx: numberOrNull(combat.movement.dx),
          dy: numberOrNull(combat.movement.dy),
          reason: boundedText(combat.movement.reason)
        }
      : null,
    stop: {
      eligibleAt: numberOrNull(metrics.stopEligibleAt),
      dispatchAt: numberOrNull(metrics.stopDispatchAt),
      shouldLeave: Boolean(action?.shouldLeave || combat.exit?.shouldLeave)
    },
    exit: combat.exit
      ? {
          reason: boundedText(combat.exit.reason),
          shouldLeave: Boolean(combat.exit.shouldLeave),
          hard: Boolean(combat.exit.hard || combat.exit.urgent || combat.exit.immediate)
        }
      : null
  };
}

function createCombatAuditLedger() {
  return {
    frameCount: 0,
    firstAtMs: null,
    lastAtMs: null,
    firstEligibleAt: null,
    lastEligibleAt: null,
    modes: Object.create(null),
    policies: Object.create(null),
    desiredActions: Object.create(null),
    finalActions: Object.create(null),
    hardBlockers: Object.create(null),
    advisoryBlockers: Object.create(null),
    targetIds: Object.create(null),
    arbitrationModes: Object.create(null),
    arbitrationReasons: Object.create(null),
    targetSwitchCount: 0,
    oscillatingTargetSwitchCount: 0,
    transitions: [],
    lastMode: '',
    lastPolicy: '',
    firstDispatchAt: null,
    lastDispatchAt: null,
    stopDispatchAt: null,
    dispatchCount: 0,
    acceptedAckCount: 0,
    lateAckCount: 0,
    orphanAckCount: 0,
    duplicateAckCount: 0,
    skipEventCount: 0,
    skipCount: 0,
    skipReasons: Object.create(null),
    lastSkipReason: '',
    crossSegmentAckCount: 0,
    leaveDispatchCount: 0
  };
}

function increment(map, key) {
  const normalized = boundedText(key);
  if (!normalized) return;
  map[normalized] = Number(map[normalized] || 0) + 1;
}

function observeCombatAudit(ledger, audit, atMs) {
  const next = ledger || createCombatAuditLedger();
  if (!audit || typeof audit !== 'object') return next;
  const at = numberOrNull(atMs);
  next.frameCount += 1;
  if (next.firstAtMs === null && at !== null) next.firstAtMs = at;
  if (at !== null) next.lastAtMs = at;
  if (next.firstEligibleAt === null && audit.firstEligibleAt !== null) next.firstEligibleAt = audit.firstEligibleAt;
  if (audit.lastEligibleAt !== null) next.lastEligibleAt = audit.lastEligibleAt;
  increment(next.modes, audit.mode);
  increment(next.policies, audit.policy);
  increment(next.desiredActions, audit.desiredAction?.kind || audit.desiredAction?.reason);
  increment(next.finalActions, `${audit.finalAction?.band || ''}:${audit.finalAction?.kind || ''}:${audit.finalAction?.reason || ''}`);
  for (const blocker of audit.blockers?.hard || []) increment(next.hardBlockers, blocker);
  for (const blocker of audit.blockers?.advisory || []) increment(next.advisoryBlockers, blocker);
  increment(next.targetIds, audit.target?.id);
  increment(next.arbitrationModes, audit.arbitration?.mode);
  increment(next.arbitrationReasons, audit.arbitration?.reason);
  if (audit.targetSwitch) {
    next.targetSwitchCount += 1;
    if (audit.targetSwitch.oscillating) next.oscillatingTargetSwitchCount += 1;
  }
  const mode = boundedText(audit.mode);
  const policy = boundedText(audit.policy);
  if ((mode && next.lastMode && mode !== next.lastMode) || (policy && next.lastPolicy && policy !== next.lastPolicy)) {
    next.transitions.push({
      atMs: at,
      fromMode: next.lastMode,
      toMode: mode,
      fromPolicy: next.lastPolicy,
      toPolicy: policy,
      reason: boundedText(audit.modeTransitionReason || audit.policyReason)
    });
    if (next.transitions.length > MAX_AUDIT_TRANSITIONS) next.transitions.shift();
  }
  if (mode) next.lastMode = mode;
  if (policy) next.lastPolicy = policy;
  if (audit.stop?.eligibleAt !== null && audit.stop?.dispatchAt !== null) {
    next.stopDispatchAt = audit.stop.dispatchAt;
  }
  return next;
}

function observeCombatAuditExecution(ledger, event = {}) {
  const next = ledger || createCombatAuditLedger();
  const type = String(event.type || '');
  const at = numberOrNull(event.atMs);
  if (type === 'shoot-dispatch') {
    next.dispatchCount += 1;
    if (next.firstDispatchAt === null) next.firstDispatchAt = at;
    next.lastDispatchAt = at;
  } else if (type === 'shoot-ack-accepted') {
    next.acceptedAckCount += 1;
  } else if (type === 'shoot-ack-late') {
    next.lateAckCount += 1;
  } else if (type === 'shoot-ack-orphan') {
    next.orphanAckCount += 1;
  } else if (type === 'shoot-ack-duplicate') {
    next.duplicateAckCount += 1;
  } else if (type === 'shoot-skip') {
    next.skipEventCount += 1;
    const reason = boundedText(event.skipReason || event.outcome);
    if (reason !== next.lastSkipReason) {
      next.skipCount += 1;
      increment(next.skipReasons, reason);
    }
    next.lastSkipReason = reason;
  } else if (type === 'shoot-stop') {
    next.stopDispatchAt = at;
  }
  if (type !== 'shoot-skip') next.lastSkipReason = '';
  if (event.ownershipDisposition === 'cross-segment-ack') next.crossSegmentAckCount += 1;
  return next;
}

function observeCombatAuditTail(ledger, type, detail = {}, atMs = null) {
  const next = ledger || createCombatAuditLedger();
  if (type === 'leave-request-start') {
    next.leaveDispatchCount += 1;
    if (next.stopDispatchAt === null) next.stopDispatchAt = numberOrNull(atMs ?? detail.startedAtMs);
  }
  return next;
}

function topCounts(map, limit = MAX_AUDIT_LIST) {
  return Object.entries(map || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count: Number(count || 0) }));
}

function summarizeCombatAudit(ledger) {
  const value = ledger || createCombatAuditLedger();
  const summary = {
    version: COMBAT_AUDIT_VERSION,
    frameCount: value.frameCount
  };
  if (value.frameCount > 0) {
    Object.assign(summary, {
      firstAtMs: value.firstAtMs,
      lastAtMs: value.lastAtMs,
      firstEligibleAt: value.firstEligibleAt,
      lastEligibleAt: value.lastEligibleAt
    });
  }
  for (const [key, map] of [
    ['modes', value.modes],
    ['policies', value.policies],
    ['desiredActions', value.desiredActions],
    ['finalActions', value.finalActions],
    ['hardBlockers', value.hardBlockers],
    ['advisoryBlockers', value.advisoryBlockers],
    ['targetIds', value.targetIds],
    ['arbitrationModes', value.arbitrationModes],
    ['arbitrationReasons', value.arbitrationReasons],
    ['skipReasons', value.skipReasons]
  ]) {
    const counts = topCounts(map);
    if (counts.length) summary[key] = counts;
  }
  if (value.targetSwitchCount) summary.targetSwitchCount = value.targetSwitchCount;
  if (value.oscillatingTargetSwitchCount) summary.oscillatingTargetSwitchCount = value.oscillatingTargetSwitchCount;
  if (value.transitions.length) summary.transitions = value.transitions.slice(-MAX_AUDIT_TRANSITIONS);
  for (const key of ['firstDispatchAt', 'lastDispatchAt', 'stopDispatchAt']) {
    if (value[key] !== null) summary[key] = value[key];
  }
  for (const key of ['dispatchCount', 'acceptedAckCount', 'lateAckCount', 'orphanAckCount', 'duplicateAckCount', 'skipEventCount', 'skipCount', 'crossSegmentAckCount', 'leaveDispatchCount']) {
    if (value[key]) summary[key] = value[key];
  }
  return summary;
}

module.exports = {
  COMBAT_AUDIT_VERSION,
  MAX_AUDIT_LIST,
  MAX_AUDIT_TRANSITIONS,
  buildCombatAudit,
  createCombatAuditLedger,
  observeCombatAudit,
  observeCombatAuditExecution,
  observeCombatAuditTail,
  scalarPolicy,
  summarizeCombatAudit
};
