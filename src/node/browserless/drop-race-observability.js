'use strict';

// Bounded, diagnostic-only projection for post-kill drop races.  This module
// deliberately accepts only realtime geometry.  Snapshot coins can remain
// ordinary profit evidence, but they must never create a race record.

const MAX_COMPETITORS = 8;
const EVENT_TYPES = new Set(['kill', 'drop-visible', 'settled', 'expired']);

function finite(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function identifier(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().slice(0, 80);
  return text || null;
}

function point(value) {
  const x = finite(value?.x);
  const y = finite(value?.y);
  return x === null || y === null ? null : { x: Math.round(x), y: Math.round(y) };
}

function distance(left, right) {
  const a = point(left);
  const b = point(right);
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
}

function speed(value) {
  const explicit = finite(value?.speed ?? value?.speedCmPerTick ?? value?.speed_per_tick);
  if (explicit !== null) return Math.max(0, Number(explicit));
  const vx = finite(value?.vx) ?? 0;
  const vy = finite(value?.vy) ?? 0;
  return Math.hypot(vx, vy);
}

function actorId(value) {
  return identifier(value?.userId ?? value?.user_id ?? value?.entityId ?? value?.entity_id ?? value?.id);
}

function realtimeActor(value, dropPoint, etaSpeed = 50) {
  const id = actorId(value);
  const position = point(value);
  if (!id || !position) return null;
  const actorSpeed = speed(value);
  const effectiveSpeed = Math.max(1, actorSpeed || Number(etaSpeed) || 50);
  const distanceCm = distance(value, dropPoint);
  return {
    id,
    x: position.x,
    y: position.y,
    vx: finite(value?.vx),
    vy: finite(value?.vy),
    speedCmPerTick: Number(actorSpeed.toFixed(3)),
    distanceCm: distanceCm === null ? null : Math.round(distanceCm),
    etaMs: distanceCm === null ? null : Math.round(distanceCm / effectiveSpeed * 50),
    active: value?.active === true || String(value?.current_join_mode || value?.mode || '').toLowerCase() === 'active',
    drop: value?.dropAuthority === 'realtime' ? finite(value?.drop) : null,
    dropAuthority: value?.dropAuthority === 'realtime' ? 'realtime' : ''
  };
}

function movementSummary(input = {}, action = {}, stateful = {}) {
  const pending = input?.command?.movement?.pendingVelocityCommands?.at(-1) || null;
  const transition = input?.command?.movement?.actualVelocityTransitions?.at(-1) || null;
  const lootRace = stateful?.combatTarget?.lootRacePositioning || null;
  const actionDirection = {
    dx: Math.max(-1, Math.min(1, Math.sign(Number(action?.dx ?? lootRace?.direction?.dx ?? 0)))),
    dy: Math.max(-1, Math.min(1, Math.sign(Number(action?.dy ?? lootRace?.direction?.dy ?? 0))))
  };
  const candidate = Boolean(
    lootRace?.active
      || lootRace?.applied
      || String(action?.reason || '').includes('loot-race')
      || String(action?.reason || '').includes('post-kill-drop')
  );
  return {
    candidate,
    reason: String(lootRace?.reason || action?.reason || ''),
    direction: actionDirection,
    commandId: pending?.commandId ?? transition?.commandId ?? null,
    decisionToWireMs: finite(pending?.decisionToVelocitySendMs),
    wireToVisibleMs: finite(transition?.velocitySendToVisibleWallMs),
    ackToEffectiveMs: finite(transition?.executionDelayMs),
    feedbackWaitMs: finite(input?.command?.movement?.feedbackWaitMs),
    pendingVelocityDepth: Array.isArray(input?.command?.movement?.pendingVelocityCommands)
      ? input.command.movement.pendingVelocityCommands.length
      : null,
    pendingVelocity: pending ? {
      dx: Number(pending.dx || 0),
      dy: Number(pending.dy || 0),
      effectiveAfterTicks: finite(pending.effectiveAfterTicks)
    } : null
  };
}

// Bounded, closed enum.  Diagnostic only: never read by target, aim, fire, Dodge,
// movement, login, profit or exit logic.
function evidenceAuthority(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'realtime' || raw === 'native') return 'realtime';
  return raw === 'snapshot' ? 'snapshot' : '';
}

function matchedCoinSummary(value) {
  if (!value || typeof value !== 'object') return null;
  const authority = evidenceAuthority(value.authority);
  const key = identifier(value.key);
  const amount = finite(value.amount);
  const observedAtMs = finite(value.observedAtMs);
  const ageMs = finite(value.ageMs);
  if (!authority && key === null && amount === null && observedAtMs === null) return null;
  return {
    authority,
    key,
    amount,
    observedAtMs: observedAtMs === null ? null : Math.round(observedAtMs),
    ageMs: ageMs === null ? null : Math.max(0, Math.round(ageMs))
  };
}

// A positive Drop delta at disappearance is settlement attribution, so under
// UC-018 it counts whether the reading came from realtime or from snapshot
// metadata -- the authority is named in the reason and in attributionAuthority.
// `confirmed` still requires a server-authority picker: snapshot evidence is
// capped at `strong-inference` (daily-iteration.md section 4.7).
function classify(detail = {}) {
  const picker = detail?.disappearance?.picker;
  const event = String(detail?.event || '');
  if (picker?.id && picker?.authority === 'server') {
    return { classification: 'confirmed', reason: 'server-picker', authority: 'server' };
  }
  if (!['settled', 'expired'].includes(event)) {
    return { classification: 'unresolved', reason: 'non-terminal-event', authority: '' };
  }
  if (Number(detail?.disappearance?.selfDropDelta) > 0) {
    const authority = detail?.disappearance?.selfDropAuthority || '';
    return {
      classification: 'strong-inference',
      reason: authority === 'snapshot' ? 'snapshot-self-drop-increase' : 'self-drop-increase',
      authority
    };
  }
  const competitor = Array.isArray(detail?.disappearance?.competitorDropDeltas)
    ? detail.disappearance.competitorDropDeltas.find(item => Number(item?.delta) > 0)
    : null;
  if (competitor) {
    const authority = competitor.authority || '';
    return {
      classification: 'strong-inference',
      reason: authority === 'snapshot' ? 'snapshot-competitor-drop-increase' : 'competitor-drop-increase',
      authority
    };
  }
  const coinAuthority = detail?.matchedCoin?.authority || '';
  if (!coinAuthority) return { classification: 'unresolved', reason: 'no-matched-coin', authority: '' };
  return { classification: 'unresolved', reason: 'no-drop-delta-observed', authority: '' };
}

function dropIncreaseCount(disappearance = {}) {
  const competitors = Array.isArray(disappearance?.competitorDropDeltas)
    ? disappearance.competitorDropDeltas
    : [];
  return (Number(disappearance?.selfDropDelta) > 0 ? 1 : 0)
    + competitors.filter(item => Number(item?.delta) > 0).length;
}

function sanitizeDropRaceLifecycle(detail = {}) {
  const source = detail && typeof detail === 'object' ? detail : {};
  const event = String(source.event || source.type || '').trim();
  if (!EVENT_TYPES.has(event)) return null;
  if (String(source.realtimeAuthority || '').toLowerCase() !== 'realtime') return null;
  const dropPoint = point(source.dropPoint);
  if (!dropPoint) return null;
  const targetId = identifier(source.targetId);
  if (!targetId) return null;
  const rawCompetitors = Array.isArray(source.competitors) ? source.competitors : [];
  const competitors = rawCompetitors
    .map(item => realtimeActor(item, dropPoint))
    .filter(Boolean)
    .slice(0, MAX_COMPETITORS);
  const self = realtimeActor(source.self, dropPoint);
  const movement = movementSummary(source.input || {}, source.action || {}, source.stateful || {});
  const disappearance = source.disappearance && typeof source.disappearance === 'object'
    ? {
        selfDropDelta: finite(source.disappearance.selfDropDelta),
        selfDropAuthority: evidenceAuthority(source.disappearance.selfDropAuthority),
        competitorDropDeltas: (Array.isArray(source.disappearance.competitorDropDeltas)
          ? source.disappearance.competitorDropDeltas
          : []).slice(0, MAX_COMPETITORS).map(item => ({
            id: identifier(item?.id),
            delta: finite(item?.delta),
            authority: evidenceAuthority(item?.authority)
          })).filter(item => item.id),
        picker: source.disappearance.picker && typeof source.disappearance.picker === 'object'
          ? {
              id: identifier(source.disappearance.picker.id ?? source.disappearance.picker.userId),
              source: identifier(source.disappearance.picker.source),
              authority: identifier(source.disappearance.picker.authority)
            }
          : null
      }
    : { selfDropDelta: null, selfDropAuthority: '', competitorDropDeltas: [], picker: null };
  const output = {
    schemaVersion: 1,
    event,
    targetId,
    coinKey: identifier(source.coinKey),
    coinAmount: finite(source.coinAmount),
    matchedCoin: matchedCoinSummary(source.matchedCoin),
    targetDrop: finite(source.targetDrop),
    targetDropAuthority: identifier(source.targetDropAuthority),
    realtimeAuthority: 'realtime',
    dropPoint,
    dropPointSource: identifier(source.dropPointSource) || 'realtime-target',
    tKillMs: finite(source.tKillMs),
    tDropMs: finite(source.tDropMs),
    tLastVisibleMs: finite(source.tLastVisibleMs),
    tSettleMs: finite(source.tSettleMs),
    self,
    competitors,
    movement,
    disappearance,
    reason: identifier(source.reason) || 'unresolved',
    runId: identifier(source.runId),
    runtimeRevision: identifier(source.runtimeRevision),
    revision: identifier(source.revision),
    sessionId: identifier(source.sessionId),
    engagementId: identifier(source.engagementId),
    segmentId: identifier(source.segmentId),
    controlGeneration: identifier(source.controlGeneration),
    generation: identifier(source.generation),
    requestId: identifier(source.requestId),
    exitAttemptId: identifier(source.exitAttemptId)
  };
  const verdict = classify(output);
  output.classification = verdict.classification;
  output.classificationReason = verdict.reason;
  output.attributionAuthority = verdict.authority;
  // More than one actor gaining Drop across the same disappearance window makes
  // the winning inference ambiguous.  The verdict keeps its self-before-
  // competitor order; this states plainly how contested it was.
  output.dropIncreaseCount = dropIncreaseCount(disappearance);
  return output;
}

module.exports = {
  MAX_COMPETITORS,
  sanitizeDropRaceLifecycle,
  movementSummary,
  runDropRaceObservabilitySelfTest() {
    const realtime = sanitizeDropRaceLifecycle({
      event: 'drop-visible',
      targetId: 'target-1',
      coinKey: 'coin-1',
      coinAmount: 42,
      realtimeAuthority: 'realtime',
      dropPoint: { x: 100, y: 200 },
      dropPointSource: 'realtime-coin',
      self: { user_id: 7, x: 0, y: 0, vx: 50, vy: 0 },
      competitors: Array.from({ length: 12 }, (_, index) => ({
        user_id: index + 10,
        active: true,
        x: 20 + index,
        y: 20,
        vx: 0,
        vy: 50
      })),
      input: {
        command: {
          movement: {
            pendingVelocityCommands: [{ commandId: 'move-1', dx: 1, dy: 0, effectiveAfterTicks: 2 }],
            actualVelocityTransitions: [{ commandId: 'move-1', velocitySendToVisibleWallMs: 80, executionDelayMs: 2 }]
          }
        }
      }
    });
    if (!realtime || realtime.competitors.length !== 8 || realtime.classification !== 'unresolved') {
      throw new Error('drop-race realtime allowlist self-test failed');
    }
    if (sanitizeDropRaceLifecycle({
      event: 'drop-visible',
      targetId: 'target-1',
      realtimeAuthority: 'snapshot',
      dropPoint: { x: 1, y: 2 }
    }) !== null) {
      throw new Error('drop-race snapshot rejection self-test failed');
    }
    const base = {
      targetId: 'target-1',
      realtimeAuthority: 'realtime',
      dropPoint: { x: 100, y: 200 }
    };
    const missing = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      coinAmount: '',
      tDropMs: null,
      disappearance: { selfDropDelta: undefined, competitorDropDeltas: [] }
    });
    if (missing?.coinAmount !== null
      || missing?.tDropMs !== null
      || missing?.disappearance?.selfDropDelta !== null
      || missing?.classification !== 'unresolved') {
      throw new Error('drop-race missing numeric evidence self-test failed');
    }
    const explicitZero = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      coinAmount: 0,
      tDropMs: 0,
      disappearance: { selfDropDelta: 0, competitorDropDeltas: [{ id: 'other', delta: 0 }] }
    });
    if (explicitZero?.coinAmount !== 0
      || explicitZero?.tDropMs !== 0
      || explicitZero?.disappearance?.selfDropDelta !== 0
      || explicitZero?.classification !== 'unresolved') {
      throw new Error('drop-race explicit zero evidence self-test failed');
    }
    const selfIncrease = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      disappearance: { selfDropDelta: 3, competitorDropDeltas: [] }
    });
    if (selfIncrease?.classification !== 'strong-inference') {
      throw new Error('drop-race self Drop inference self-test failed');
    }
    const competitorIncrease = sanitizeDropRaceLifecycle({
      ...base,
      event: 'expired',
      disappearance: { selfDropDelta: 0, competitorDropDeltas: [{ id: 'other', delta: 2 }] }
    });
    if (competitorIncrease?.classification !== 'strong-inference') {
      throw new Error('drop-race competitor Drop inference self-test failed');
    }
    const confirmed = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      disappearance: {
        selfDropDelta: null,
        competitorDropDeltas: [],
        picker: { id: 'other', source: 'server-picker', authority: 'server' }
      }
    });
    if (confirmed?.classification !== 'confirmed') {
      throw new Error('drop-race server picker confirmation self-test failed');
    }
    const nonterminalIncrease = sanitizeDropRaceLifecycle({
      ...base,
      event: 'drop-visible',
      disappearance: { selfDropDelta: 3, competitorDropDeltas: [] }
    });
    if (nonterminalIncrease?.classification !== 'unresolved'
      || nonterminalIncrease?.classificationReason !== 'non-terminal-event') {
      throw new Error('drop-race nonterminal inference rejection self-test failed');
    }
    if (realtime?.classificationReason !== 'non-terminal-event'
      || selfIncrease?.classificationReason !== 'self-drop-increase'
      || competitorIncrease?.classificationReason !== 'competitor-drop-increase'
      || confirmed?.classificationReason !== 'server-picker'
      || missing?.classificationReason !== 'no-matched-coin') {
      throw new Error('drop-race classification reason self-test failed');
    }
    // A snapshot-authority match must stay out of the realtime-gated fields while
    // still explaining itself, so an operator can tell a missing realtime coin
    // transport apart from a realtime coin that failed to match.
    const snapshotMatched = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      coinKey: null,
      coinAmount: null,
      tDropMs: null,
      matchedCoin: { authority: 'snapshot', key: 'coin-9', amount: 71, observedAtMs: 1000, ageMs: 250 },
      disappearance: { selfDropDelta: 0, competitorDropDeltas: [] }
    });
    if (snapshotMatched?.coinKey !== null
      || snapshotMatched?.coinAmount !== null
      || snapshotMatched?.tDropMs !== null
      || snapshotMatched?.matchedCoin?.authority !== 'snapshot'
      || snapshotMatched?.matchedCoin?.key !== 'coin-9'
      || snapshotMatched?.matchedCoin?.amount !== 71
      || snapshotMatched?.matchedCoin?.ageMs !== 250
      || snapshotMatched?.classification !== 'unresolved'
      || snapshotMatched?.classificationReason !== 'no-drop-delta-observed'
      || snapshotMatched?.attributionAuthority !== ''
      || snapshotMatched?.dropIncreaseCount !== 0) {
      throw new Error('drop-race snapshot matched-coin disclosure self-test failed');
    }
    const realtimeMatched = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      coinKey: 'coin-3',
      coinAmount: 12,
      matchedCoin: { authority: 'native', key: 'coin-3', amount: 12, observedAtMs: 2000, ageMs: -5 },
      disappearance: { selfDropDelta: 0, competitorDropDeltas: [] }
    });
    if (realtimeMatched?.matchedCoin?.authority !== 'realtime'
      || realtimeMatched?.matchedCoin?.ageMs !== 0
      || realtimeMatched?.classification !== 'unresolved'
      || realtimeMatched?.classificationReason !== 'no-drop-delta-observed') {
      throw new Error('drop-race realtime matched-coin disclosure self-test failed');
    }
    if (sanitizeDropRaceLifecycle({ ...base, event: 'settled', matchedCoin: {} })?.matchedCoin !== null) {
      throw new Error('drop-race empty matched-coin normalization self-test failed');
    }
    // UC-018: a snapshot-sourced Drop delta is valid attribution evidence and
    // reaches strong-inference, but it must name its authority and can never be
    // promoted to confirmed.
    const snapshotSelfIncrease = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      disappearance: { selfDropDelta: 5, selfDropAuthority: 'snapshot', competitorDropDeltas: [] }
    });
    if (snapshotSelfIncrease?.classification !== 'strong-inference'
      || snapshotSelfIncrease?.classificationReason !== 'snapshot-self-drop-increase'
      || snapshotSelfIncrease?.attributionAuthority !== 'snapshot'
      || snapshotSelfIncrease?.disappearance?.selfDropAuthority !== 'snapshot'
      || snapshotSelfIncrease?.dropIncreaseCount !== 1) {
      throw new Error('drop-race snapshot self Drop attribution self-test failed');
    }
    const snapshotCompetitorIncrease = sanitizeDropRaceLifecycle({
      ...base,
      event: 'expired',
      disappearance: {
        selfDropDelta: 0,
        selfDropAuthority: 'snapshot',
        competitorDropDeltas: [{ id: 'other', delta: 4, authority: 'snapshot' }]
      }
    });
    if (snapshotCompetitorIncrease?.classification !== 'strong-inference'
      || snapshotCompetitorIncrease?.classificationReason !== 'snapshot-competitor-drop-increase'
      || snapshotCompetitorIncrease?.attributionAuthority !== 'snapshot'
      || snapshotCompetitorIncrease?.disappearance?.competitorDropDeltas?.[0]?.authority !== 'snapshot'
      || snapshotCompetitorIncrease?.dropIncreaseCount !== 1) {
      throw new Error('drop-race snapshot competitor Drop attribution self-test failed');
    }
    // A server picker still outranks any snapshot evidence, and snapshot
    // evidence alone never reaches confirmed.
    const snapshotWithPicker = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      disappearance: {
        selfDropDelta: 9,
        selfDropAuthority: 'snapshot',
        competitorDropDeltas: [],
        picker: { id: 'other', source: 'server-picker', authority: 'server' }
      }
    });
    if (snapshotWithPicker?.classification !== 'confirmed'
      || snapshotWithPicker?.classificationReason !== 'server-picker'
      || snapshotWithPicker?.attributionAuthority !== 'server') {
      throw new Error('drop-race server picker precedence self-test failed');
    }
    // Contested disappearance: the verdict keeps its self-first order, but the
    // ambiguity has to be visible.
    const contested = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      disappearance: {
        selfDropDelta: 2,
        selfDropAuthority: 'realtime',
        competitorDropDeltas: [{ id: 'other', delta: 3, authority: 'snapshot' }]
      }
    });
    if (contested?.classification !== 'strong-inference'
      || contested?.classificationReason !== 'self-drop-increase'
      || contested?.attributionAuthority !== 'realtime'
      || contested?.dropIncreaseCount !== 2) {
      throw new Error('drop-race contested Drop increase self-test failed');
    }
    // An unlabelled delta must not silently claim realtime provenance.
    const unlabelled = sanitizeDropRaceLifecycle({
      ...base,
      event: 'settled',
      disappearance: { selfDropDelta: 1, selfDropAuthority: 'guess', competitorDropDeltas: [] }
    });
    if (unlabelled?.disappearance?.selfDropAuthority !== ''
      || unlabelled?.classificationReason !== 'self-drop-increase'
      || unlabelled?.attributionAuthority !== '') {
      throw new Error('drop-race unlabelled Drop authority self-test failed');
    }
    if (selfIncrease?.attributionAuthority !== ''
      || competitorIncrease?.attributionAuthority !== ''
      || confirmed?.attributionAuthority !== 'server'
      || missing?.attributionAuthority !== ''
      || realtime?.attributionAuthority !== '') {
      throw new Error('drop-race attribution authority self-test failed');
    }
    return { ok: true, cases: 16, maxCompetitors: realtime.competitors.length };
  }
};
