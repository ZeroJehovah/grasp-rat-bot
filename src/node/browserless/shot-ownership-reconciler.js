'use strict';

const fs = require('fs');
const path = require('path');

const DISPATCH_TYPE = 'shoot-dispatch';
const ACCEPTED_TYPES = new Set(['shoot-ack-accepted', 'shoot-ack-late']);
const EXECUTION_TYPES = new Set([
  DISPATCH_TYPE,
  ...ACCEPTED_TYPES,
  'shoot-skip',
  'shoot-stop'
]);
const OUTSIDE_BATTLE_EXECUTION_CLASSES = new Set(['profit-opportunity', 'safety']);

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function segmentIdFor(row = {}, ordinal = 1) {
  return text(row.segmentId || `${row.engagementId || ''}#${row.segmentOrdinal || ordinal}`);
}

function normalizeSegment(row = {}, ordinal = 1) {
  const segmentId = segmentIdFor(row, ordinal);
  return {
    row,
    indexLine: numberOrNull(row.line ?? row.indexLine) ?? ordinal,
    segmentId,
    file: text(row.file),
    targetId: text(row.targetId),
    runId: text(row.runId),
    controlGeneration: text(row.controlGeneration),
    engagementGeneration: text(row.engagementGeneration),
    startedAtMs: numberOrNull(row.segmentStartedAt ?? row.segmentStartedAtMs),
    endedAtMs: numberOrNull(row.segmentEndedAt ?? row.segmentEndedAtMs),
    auditDispatchCount: numberOrNull(row.combatAudit?.dispatchCount),
    auditAcceptedCount: numberOrNull(row.combatAudit?.acceptedAckCount),
    indexPhysicalDispatchCount: Math.max(0, Number(row.segmentRequestedShots || 0)),
    indexPhysicalAcceptedCount: Math.max(0, Number(row.segmentAcceptedShots || 0))
  };
}

function eventType(event = {}) {
  return text(event.type || event.detail?.type);
}

function eventAtMs(event = {}) {
  return numberOrNull(event.atMs ?? event.detail?.atMs ?? event.at ?? event.detail?.at);
}

function requestKey(event = {}) {
  const requestId = text(event.requestId ?? event.commandId ?? event.detail?.requestId ?? event.detail?.commandId);
  if (requestId) return `id:${requestId}`;
  const requestSequence = numberOrNull(event.requestSequence ?? event.detail?.requestSequence);
  if (requestSequence === null) return '';
  const controlGeneration = text(event.controlGeneration ?? event.detail?.controlGeneration);
  return `sequence:${controlGeneration}:${requestSequence}`;
}

function bulletIdentity(event = {}) {
  const ack = event.ack || event.detail?.ack || {};
  return text(ack.bullet_id ?? ack.bulletId ?? event.bulletId);
}

function eventIdentity(event = {}) {
  return [
    eventType(event),
    requestKey(event),
    numberOrNull(event.sequence ?? event.detail?.sequence) ?? '',
    eventAtMs(event) ?? '',
    bulletIdentity(event)
  ].join('|');
}

function bump(target, key, amount = 1) {
  const normalized = text(key || 'unknown');
  target[normalized] = Number(target[normalized] || 0) + amount;
}

function emptyCounts() {
  return {
    total: 0,
    dispatch: 0,
    accepted: 0,
    acceptedOnTime: 0,
    acceptedLate: 0,
    skip: 0,
    stop: 0,
    other: 0,
    byType: {}
  };
}

function recordCount(counts, type) {
  counts.total += 1;
  bump(counts.byType, type);
  if (type === DISPATCH_TYPE) counts.dispatch += 1;
  else if (type === 'shoot-ack-accepted') {
    counts.accepted += 1;
    counts.acceptedOnTime += 1;
  } else if (type === 'shoot-ack-late') {
    counts.accepted += 1;
    counts.acceptedLate += 1;
  } else if (type === 'shoot-skip') counts.skip += 1;
  else if (type === 'shoot-stop') counts.stop += 1;
  else counts.other += 1;
}

function segmentCounter(segment) {
  return {
    indexLine: segment.indexLine,
    segmentId: segment.segmentId,
    file: segment.file,
    targetId: segment.targetId,
    physical: emptyCounts(),
    amended: emptyCounts(),
    unresolved: emptyCounts(),
    unresolvedReasons: {},
    physicalEvidence: 'execution-events'
  };
}

function eventField(event, field) {
  return event?.[field] ?? event?.detail?.[field];
}

function targetCompatible(segment, event) {
  const targetId = text(eventField(event, 'targetId'));
  return !targetId || !segment.targetId || targetId === segment.targetId;
}

function controlCompatible(segment, event) {
  const generation = text(eventField(event, 'controlGeneration'));
  return !generation || !segment.controlGeneration || generation === segment.controlGeneration;
}

function timeCompatible(segment, event, options = {}) {
  const atMs = eventAtMs(event);
  if (atMs === null || segment.startedAtMs === null || segment.endedAtMs === null) return true;
  const beforeMs = Math.max(0, Number(options.beforeMs ?? 1000));
  const afterMs = Math.max(0, Number(options.afterMs ?? 1000));
  return atMs >= segment.startedAtMs - beforeMs && atMs <= segment.endedAtMs + afterMs;
}

function compatibleSegment(segment, event, options = {}) {
  return targetCompatible(segment, event)
    && controlCompatible(segment, event)
    && timeCompatible(segment, event, options);
}

function uniqueSegments(values = []) {
  return [...new Map(values.filter(Boolean).map(segment => [segment.segmentId, segment])).values()];
}

function resolution(segments, source, ambiguousReason = `ambiguous-${source}`) {
  const unique = uniqueSegments(segments);
  if (unique.length === 1) return { segment: unique[0], source };
  if (unique.length > 1) return { segment: null, reason: ambiguousReason, candidates: unique.map(item => item.segmentId) };
  return null;
}

function reconcileShotOwnership(options = {}) {
  const segments = (options.segments || []).map((row, index) => normalizeSegment(row, index + 1));
  const segmentById = new Map(segments.map(segment => [segment.segmentId, segment]));
  const segmentByFile = new Map(segments.filter(segment => segment.file).map(segment => [segment.file, segment]));
  const counters = new Map(segments.map(segment => [segment.segmentId, segmentCounter(segment)]));
  const physicalSegments = Array.isArray(options.physicalSegments) ? options.physicalSegments : [];
  const physicalIdentities = new Set();
  const dispatchOwners = new Map();
  const assignments = [];
  const amendmentIdentities = new Set();
  const duplicateReasons = {};
  const unresolvedReasons = {};
  const rawByType = {};
  const assignedByType = {};
  const duplicateByType = {};
  const unresolvedByType = {};
  const outsideByType = {};

  function addDispatchOwner(key, segmentId) {
    if (!key || !segmentId) return;
    if (!dispatchOwners.has(key)) dispatchOwners.set(key, new Set());
    dispatchOwners.get(key).add(segmentId);
  }

  for (const physical of physicalSegments) {
    const segment = segmentById.get(text(physical.segmentId))
      || segmentByFile.get(text(physical.file));
    if (!segment) continue;
    const counter = counters.get(segment.segmentId);
    for (const rawEvent of physical.events || []) {
      const event = rawEvent.detail?.type ? { ...rawEvent.detail, atMs: rawEvent.detail.atMs ?? rawEvent.atMs } : rawEvent;
      const type = eventType(event);
      if (!type) continue;
      physicalIdentities.add(eventIdentity(event));
      recordCount(counter.physical, type);
      if (type === DISPATCH_TYPE) addDispatchOwner(requestKey(event), segment.segmentId);
    }
  }

  for (const segment of segments) {
    const counter = counters.get(segment.segmentId);
    if (counter.physical.total > 0) continue;
    counter.physicalEvidence = 'index-summary';
    counter.physical.dispatch = segment.indexPhysicalDispatchCount;
    counter.physical.accepted = segment.indexPhysicalAcceptedCount;
    counter.physical.total = counter.physical.dispatch + counter.physical.accepted;
    counter.physical.byType[DISPATCH_TYPE] = counter.physical.dispatch;
    counter.physical.byType['shoot-ack-accepted'] = counter.physical.accepted;
  }

  function exactCurrentCandidates(event) {
    const candidates = [];
    const currentId = text(eventField(event, 'currentSegmentId'));
    const currentFile = text(eventField(event, 'currentSegmentFile'));
    if (currentId) candidates.push(segmentById.get(currentId));
    if (currentFile) candidates.push(segmentByFile.get(currentFile));
    return uniqueSegments(candidates).filter(segment => compatibleSegment(segment, event, {
      beforeMs: 5000,
      afterMs: ACCEPTED_TYPES.has(eventType(event)) ? 60000 : 5000
    }));
  }

  function explicitOriginCandidates(event) {
    const candidates = [];
    for (const id of [
      eventField(event, 'segmentGeneration'),
      eventField(event, 'originSegmentId')
    ].map(text).filter(Boolean)) candidates.push(segmentById.get(id));
    const originFile = text(eventField(event, 'originFile'));
    if (originFile) candidates.push(segmentByFile.get(originFile));
    return uniqueSegments(candidates).filter(segment => compatibleSegment(segment, event, {
      beforeMs: 5000,
      afterMs: ACCEPTED_TYPES.has(eventType(event)) ? 120000 : 5000
    }));
  }

  function engagementCandidates(event) {
    const generation = text(eventField(event, 'engagementGeneration'));
    if (!generation) return [];
    return segments.filter(segment => segment.engagementGeneration === generation
      && compatibleSegment(segment, event, {
        beforeMs: 5000,
        afterMs: ACCEPTED_TYPES.has(eventType(event)) ? 120000 : 5000
      }));
  }

  function targetTimeCandidates(event) {
    const targetId = text(eventField(event, 'targetId'));
    const atMs = eventAtMs(event);
    if (!targetId || atMs === null) return [];
    return segments.filter(segment => segment.targetId === targetId
      && controlCompatible(segment, event)
      && timeCompatible(segment, event, {
        beforeMs: 1000,
        afterMs: ACCEPTED_TYPES.has(eventType(event)) ? 3000 : 1000
      }));
  }

  function unresolvedReasonFor(event) {
    const currentId = text(eventField(event, 'currentSegmentId'));
    const currentFile = text(eventField(event, 'currentSegmentFile'));
    const current = segmentById.get(currentId) || segmentByFile.get(currentFile) || null;
    if ((currentId || currentFile) && !current) return 'current-segment-not-in-index';
    if (current) {
      if (!targetCompatible(current, event)) return 'current-segment-target-mismatch';
      if (!controlCompatible(current, event)) return 'current-segment-control-mismatch';
      if (!timeCompatible(current, event, { beforeMs: 5000, afterMs: ACCEPTED_TYPES.has(eventType(event)) ? 60000 : 5000 })) {
        return 'current-segment-time-mismatch';
      }
    }
    const explicitIds = [
      text(eventField(event, 'segmentGeneration')),
      text(eventField(event, 'originSegmentId'))
    ].filter(Boolean);
    const explicitFile = text(eventField(event, 'originFile'));
    const explicit = explicitIds.map(id => segmentById.get(id)).find(Boolean)
      || segmentByFile.get(explicitFile)
      || null;
    if ((explicitIds.length || explicitFile) && !explicit) return 'referenced-segment-not-in-index';
    if (explicit) {
      if (!targetCompatible(explicit, event)) return 'explicit-segment-target-mismatch';
      if (!controlCompatible(explicit, event)) return 'explicit-segment-control-mismatch';
      return 'explicit-segment-time-mismatch';
    }
    if (!text(eventField(event, 'engagementGeneration'))) return 'missing-segment-and-engagement-evidence';
    if (!text(eventField(event, 'targetId'))) return 'missing-target-evidence';
    return 'no-compatible-segment';
  }

  function resolveEvent(event) {
    const type = eventType(event);
    const executionClass = text(eventField(event, 'executionClass'));
    const explicitlyOutside = OUTSIDE_BATTLE_EXECUTION_CLASSES.has(executionClass)
      && [
        eventField(event, 'originStatus'),
        eventField(event, 'ownershipDisposition')
      ].some(value => text(value) === 'outside-battle-context');
    const hasOwnershipEvidence = [
      'originSegmentId',
      'segmentGeneration',
      'currentSegmentId',
      'currentSegmentFile',
      'engagementGeneration'
    ].some(field => text(eventField(event, field)));
    if (explicitlyOutside
      || (OUTSIDE_BATTLE_EXECUTION_CLASSES.has(executionClass) && !hasOwnershipEvidence)) {
      return { segment: null, reason: 'outside-battle-context' };
    }
    const key = requestKey(event);
    if (ACCEPTED_TYPES.has(type) && !key) {
      return { segment: null, reason: 'missing-request-identity-no-unique-owner' };
    }
    if (ACCEPTED_TYPES.has(type) && key) {
      const owners = uniqueSegments([...(dispatchOwners.get(key) || [])].map(id => segmentById.get(id)));
      const byRequest = resolution(owners, 'request-identity', 'ambiguous-request-owner');
      if (byRequest) return byRequest;
    }
    const current = resolution(exactCurrentCandidates(event), 'current-segment', 'ambiguous-current-segment');
    if (current) return current;
    const explicit = resolution(explicitOriginCandidates(event), 'explicit-segment-generation', 'ambiguous-explicit-segment');
    if (explicit) return explicit;
    const engagement = resolution(engagementCandidates(event), 'engagement-generation-target', 'ambiguous-engagement-generation');
    if (engagement) return engagement;
    const targetTime = resolution(targetTimeCandidates(event), 'target-time', 'ambiguous-target-time');
    if (targetTime) return targetTime;
    return { segment: null, reason: unresolvedReasonFor(event) };
  }

  const amendments = (options.amendments || []).map((event, index) => ({
    ...event,
    amendmentLine: numberOrNull(event.amendmentLine ?? event.line) ?? index + 1
  })).sort((left, right) => (eventAtMs(left) ?? 0) - (eventAtMs(right) ?? 0)
    || left.amendmentLine - right.amendmentLine);

  for (const event of amendments) {
    const type = eventType(event) || 'unknown';
    bump(rawByType, type);
    const identity = eventIdentity(event);
    let duplicateReason = '';
    if (amendmentIdentities.has(identity)) duplicateReason = 'duplicate-amendment-event';
    else if (physicalIdentities.has(identity)) duplicateReason = 'duplicate-physical-event';
    amendmentIdentities.add(identity);

    const key = requestKey(event);
    if (!duplicateReason && type === DISPATCH_TYPE && key && dispatchOwners.has(key)) {
      duplicateReason = dispatchOwners.get(key).size === 1
        ? 'duplicate-dispatch-request'
        : 'ambiguous-duplicate-dispatch-request';
    }
    if (duplicateReason) {
      bump(duplicateReasons, duplicateReason);
      bump(duplicateByType, type);
      assignments.push({ event, type, status: 'duplicate', reason: duplicateReason, segmentId: null });
      continue;
    }

    const resolved = EXECUTION_TYPES.has(type)
      ? resolveEvent(event)
      : { segment: null, reason: 'unsupported-execution-type' };
    if (!resolved?.segment) {
      const reason = text(resolved?.reason || 'unresolved');
      if (reason === 'outside-battle-context') {
        bump(outsideByType, type);
        assignments.push({
          event,
          type,
          status: 'outside-battle-context',
          reason,
          candidates: resolved?.candidates || [],
          segmentId: null
        });
        continue;
      }
      bump(unresolvedReasons, reason);
      bump(unresolvedByType, type);
      const related = segmentById.get(text(eventField(event, 'currentSegmentId')))
        || segmentByFile.get(text(eventField(event, 'currentSegmentFile')))
        || null;
      if (related) {
        const counter = counters.get(related.segmentId);
        recordCount(counter.unresolved, type);
        bump(counter.unresolvedReasons, reason);
      }
      assignments.push({
        event,
        type,
        status: 'unresolved',
        reason,
        candidates: resolved?.candidates || [],
        segmentId: null,
        relatedSegmentId: related?.segmentId || null
      });
      continue;
    }

    const segment = resolved.segment;
    const counter = counters.get(segment.segmentId);
    recordCount(counter.amended, type);
    bump(assignedByType, type);
    if (type === DISPATCH_TYPE) addDispatchOwner(key, segment.segmentId);
    assignments.push({
      event,
      type,
      status: 'assigned',
      source: resolved.source,
      segmentId: segment.segmentId,
      file: segment.file
    });
  }

  const rows = segments.map(segment => {
    const counter = counters.get(segment.segmentId);
    const correctedDispatchCount = counter.physical.dispatch + counter.amended.dispatch;
    const correctedAcceptedCount = counter.physical.accepted + counter.amended.accepted;
    const executionCountsMatchAudit = segment.auditDispatchCount === null
      || segment.auditAcceptedCount === null
      || (correctedDispatchCount === segment.auditDispatchCount
        && correctedAcceptedCount === segment.auditAcceptedCount);
    return {
      ...counter,
      corrected: {
        dispatch: correctedDispatchCount,
        accepted: correctedAcceptedCount,
        acceptedOnTime: counter.physical.acceptedOnTime + counter.amended.acceptedOnTime,
        acceptedLate: counter.physical.acceptedLate + counter.amended.acceptedLate
      },
      combatAudit: {
        dispatch: segment.auditDispatchCount,
        accepted: segment.auditAcceptedCount,
        executionCountsMatchAudit
      },
      invariant: {
        acceptedNotOverDispatch: correctedAcceptedCount <= correctedDispatchCount,
        noUnresolvedEvents: counter.unresolved.total === 0,
        executionCountsMatchAudit,
        ok: correctedAcceptedCount <= correctedDispatchCount
          && counter.unresolved.total === 0
          && executionCountsMatchAudit
      }
    };
  });

  const rawAmendmentCount = amendments.length;
  const duplicateCount = Object.values(duplicateByType).reduce((sum, value) => sum + value, 0);
  const assignedCount = Object.values(assignedByType).reduce((sum, value) => sum + value, 0);
  const unresolvedCount = Object.values(unresolvedByType).reduce((sum, value) => sum + value, 0);
  const outsideBattleCount = Object.values(outsideByType).reduce((sum, value) => sum + value, 0);
  return {
    rows,
    assignments,
    conservation: {
      rawAmendmentCount,
      duplicateCount,
      assignedCount,
      unresolvedCount,
      outsideBattleCount,
      accountedCount: duplicateCount + assignedCount + unresolvedCount + outsideBattleCount,
      ok: rawAmendmentCount === duplicateCount + assignedCount + unresolvedCount + outsideBattleCount,
      rawByType,
      assignedByType,
      duplicateByType,
      unresolvedByType,
      outsideByType,
      duplicateReasons,
      unresolvedReasons
    }
  };
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line, index) => ({
    ...JSON.parse(line),
    line: index + 1
  }));
}

function loadShotOwnershipInputs(dayDir, options = {}) {
  const battlesDir = path.join(dayDir, 'battles');
  const indexFile = options.indexFile || path.join(battlesDir, 'index.jsonl');
  const amendmentsFile = options.amendmentsFile || path.join(battlesDir, 'shot-amendments.jsonl');
  return {
    segments: readJsonl(indexFile),
    amendments: readJsonl(amendmentsFile).map(row => ({
      ...row,
      amendmentLine: row.line
    }))
  };
}

function assignedEventsForSegment(result, segmentId, types = null) {
  const allowed = types ? new Set(types) : null;
  return (result?.assignments || []).filter(item => item.status === 'assigned'
    && item.segmentId === segmentId
    && (!allowed || allowed.has(item.type)));
}

function runShotOwnershipReconcilerSelfTest() {
  const segments = [
    { line: 1, segmentId: 'A#1', file: 'A-1.gz', targetId: 'A', controlGeneration: 'c1', engagementGeneration: 'gA1', segmentStartedAt: 1000, segmentEndedAt: 1999, segmentRequestedShots: 1, segmentAcceptedShots: 0, combatAudit: { dispatchCount: 1, acceptedAckCount: 1 } },
    { line: 2, segmentId: 'B#1', file: 'B-1.gz', targetId: 'B', controlGeneration: 'c1', engagementGeneration: 'gB1', segmentStartedAt: 2000, segmentEndedAt: 2999, segmentRequestedShots: 0, segmentAcceptedShots: 0, combatAudit: { dispatchCount: 1, acceptedAckCount: 1 } },
    { line: 3, segmentId: 'A#2', file: 'A-2.gz', targetId: 'A', controlGeneration: 'c1', engagementGeneration: 'gA2', segmentStartedAt: 3000, segmentEndedAt: 3999, segmentRequestedShots: 0, segmentAcceptedShots: 0, combatAudit: { dispatchCount: 1, acceptedAckCount: 1 } },
    { line: 4, segmentId: 'C#1', file: 'C-1.gz', targetId: 'C', controlGeneration: 'c2', engagementGeneration: 'gC1', segmentStartedAt: 4000, segmentEndedAt: 4999, segmentRequestedShots: 0, segmentAcceptedShots: 0, combatAudit: { dispatchCount: 1, acceptedAckCount: 1 } },
    { line: 5, segmentId: 'X#1', file: 'X-1.gz', targetId: 'X', controlGeneration: 'c3', engagementGeneration: 'shared', segmentStartedAt: 5000, segmentEndedAt: 5999 },
    { line: 6, segmentId: 'X#2', file: 'X-2.gz', targetId: 'X', controlGeneration: 'c3', engagementGeneration: 'shared', segmentStartedAt: 5000, segmentEndedAt: 5999 }
  ];
  const physicalSegments = [{
    segmentId: 'A#1',
    events: [{ type: 'shoot-dispatch', atMs: 1900, requestId: 'rollover', requestSequence: 1, controlGeneration: 'c1', engagementGeneration: 'gA1', targetId: 'A' }]
  }];
  const amendments = [
    { type: 'shoot-ack-late', atMs: 2050, requestId: 'rollover', requestSequence: 1, controlGeneration: 'c1', engagementGeneration: 'gA1', targetId: 'A', currentSegmentId: 'B#1', originSegmentId: 'A#1', ack: { bullet_id: 'late-A' } },
    { type: 'shoot-dispatch', atMs: 2100, requestId: 'B-shot', requestSequence: 2, controlGeneration: 'c1', engagementGeneration: 'gB1', segmentGeneration: 'A#1', currentSegmentId: 'B#1', targetId: 'B' },
    { type: 'shoot-ack-accepted', atMs: 2120, requestId: 'B-shot', requestSequence: 2, controlGeneration: 'c1', engagementGeneration: 'gB1', segmentGeneration: 'A#1', currentSegmentId: 'B#1', targetId: 'B', ack: { bullet_id: 'B-shot' } },
    { type: 'shoot-dispatch', atMs: 3100, requestId: 'A-reopen', requestSequence: 3, controlGeneration: 'c1', engagementGeneration: 'gA2', segmentGeneration: 'A#1', currentSegmentId: 'A#2', targetId: 'A' },
    { type: 'shoot-ack-accepted', atMs: 3120, requestId: 'A-reopen', requestSequence: 3, controlGeneration: 'c1', engagementGeneration: 'gA2', segmentGeneration: 'A#1', currentSegmentId: 'A#2', targetId: 'A', ack: { bullet_id: 'A-reopen' } },
    { type: 'shoot-dispatch', atMs: 4100, requestId: 'new-control', requestSequence: 1, controlGeneration: 'c2', engagementGeneration: 'gC1', currentSegmentId: 'C#1', targetId: 'C' },
    { type: 'shoot-ack-accepted', atMs: 4120, requestId: 'new-control', requestSequence: 1, controlGeneration: 'c2', engagementGeneration: 'gC1', currentSegmentId: 'C#1', targetId: 'C', ack: { bullet_id: 'new-control' } },
    { type: 'shoot-ack-accepted', atMs: 2140, controlGeneration: 'c1', engagementGeneration: 'gB1', currentSegmentId: 'B#1', targetId: 'B', ack: { bullet_id: 'missing-request' } },
    { type: 'shoot-dispatch', atMs: 2100, requestId: 'B-shot', requestSequence: 2, controlGeneration: 'c1', engagementGeneration: 'gB1', segmentGeneration: 'A#1', currentSegmentId: 'B#1', targetId: 'B' },
    { type: 'shoot-dispatch', atMs: 5500, requestId: 'ambiguous', controlGeneration: 'c3', engagementGeneration: 'shared', targetId: 'X' },
    { type: 'shoot-ack-accepted', atMs: 7000, requestId: 'orphan', controlGeneration: 'c4', engagementGeneration: 'none', targetId: 'Z', ack: { bullet_id: 'orphan' } },
    { type: 'shoot-dispatch', atMs: 7010, requestId: 'profit-outside', executionClass: 'profit-opportunity', targetId: 'P', currentSegmentId: 'C#1', currentSegmentFile: 'C-1.gz', originStatus: 'outside-battle-context', ownershipDisposition: 'outside-battle-context' },
    { type: 'shoot-dispatch', atMs: 7020, requestId: 'unknown-context', executionClass: 'unknown', targetId: 'U' }
  ];
  const result = reconcileShotOwnership({ segments, physicalSegments, amendments });
  const byId = new Map(result.rows.map(row => [row.segmentId, row]));
  const checks = {
    conservation: result.conservation.ok && result.conservation.rawAmendmentCount === amendments.length,
    rolloverAck: byId.get('A#1').corrected.accepted === 1,
    staleGenerationRebound: byId.get('B#1').corrected.dispatch === 1 && byId.get('B#1').corrected.accepted === 1,
    sameTargetReopen: byId.get('A#2').corrected.dispatch === 1 && byId.get('A#2').corrected.accepted === 1,
    newControlFirstShot: byId.get('C#1').corrected.dispatch === 1 && byId.get('C#1').corrected.accepted === 1,
    duplicateRequestDeduped: result.conservation.duplicateReasons['duplicate-amendment-event'] === 1,
    missingRequestPreserved: result.conservation.unresolvedReasons['missing-request-identity-no-unique-owner'] === 1,
    ambiguousPreserved: result.conservation.unresolvedReasons['ambiguous-engagement-generation'] === 1,
    trulyUnresolvedPreserved: result.conservation.unresolvedReasons['no-compatible-segment'] === 1
      && result.conservation.unresolvedReasons['missing-segment-and-engagement-evidence'] === 1,
    explicitProfitOutsideBattle: result.conservation.outsideBattleCount === 1
      && result.conservation.outsideByType['shoot-dispatch'] === 1,
    unknownClassRemainsUnresolved: result.assignments.some(item => item.event.requestId === 'unknown-context'
      && item.status === 'unresolved')
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    conservation: result.conservation,
    rows: result.rows.map(row => ({
      segmentId: row.segmentId,
      physical: row.physical,
      amended: row.amended,
      unresolved: row.unresolved,
      corrected: row.corrected,
      invariant: row.invariant
    }))
  };
}

if (require.main === module) {
  const result = runShotOwnershipReconcilerSelfTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = {
  ACCEPTED_TYPES,
  DISPATCH_TYPE,
  assignedEventsForSegment,
  eventIdentity,
  loadShotOwnershipInputs,
  reconcileShotOwnership,
  requestKey,
  runShotOwnershipReconcilerSelfTest
};
