'use strict';

const { actionFocusSummary } = require('./action-priority');

function roundedNullable(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function actionSwitchPairKey(a, b) {
  return [String(a?.key || ''), String(b?.key || '')].sort().join('|');
}

function defaultClone(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function buildPreviousDecisionSummary(decision) {
  return decision ? {
    kind: decision.kind || '',
    reason: decision.reason || '',
    target: decision.target || null,
    score: roundedNullable(decision.score ?? decision.opportunityChoice?.score),
    staminaCost: roundedNullable(decision.staminaCost ?? decision.opportunityChoice?.staminaCost)
  } : null;
}

function buildCandidateSwitchSummary(action) {
  const candidate = action?.finalCandidate || {};
  const arbitration = action?.finalActionArbitration || {};
  return {
    switchAllowed: action?.opportunityChoice?.switchAllowed !== false
      && !action?.switchBlocked
      && arbitration?.mode !== 'hold-previous',
    switchBlocked: Boolean(action?.switchBlocked || action?.opportunityChoice?.switchBlocked || arbitration?.mode === 'hold-previous'),
    oldBand: String(arbitration?.to?.band || ''),
    newBand: String(candidate.priorityBand || arbitration?.from?.band || ''),
    netBenefit: roundedNullable(action?.switchNetBenefit ?? action?.opportunityChoice?.netBenefit),
    switchCost: roundedNullable(action?.switchCost ?? action?.opportunityChoice?.switchCost),
    holdRemainingMs: roundedNullable(action?.opportunityChoice?.holdRemainingMs ?? arbitration?.holdRemainingMs)
  };
}

function recordActionSwitchDiagnosticsCore(action, state, options = {}) {
  if (!state || typeof state !== 'object') {
    state = { lastFocus: null, lastTargetFocus: null, lastSwitch: null, events: [] };
  }
  if (!Array.isArray(state.events)) state.events = [];

  const clone = typeof options.clone === 'function' ? options.clone : defaultClone;
  const focusBuilder = typeof options.actionFocusSummary === 'function' ? options.actionFocusSummary : actionFocusSummary;
  const tOption = Number(options.nowMs);
  const t = Number.isFinite(tOption) ? tOption : Date.now();
  const historyLimit = Math.max(4, Math.round(Number(options.historyLimit ?? 24) || 24));
  const windowMs = Math.max(1000, Math.round(Number(options.oscillationWindowMs ?? 10000) || 10000));
  const current = focusBuilder(action, { nowMs: t });
  const previous = state.lastFocus || null;
  const previousTarget = state.lastTargetFocus || null;
  let nextAction = action;
  let event = null;

  if (previous && current && previous.key !== current.key && (previous.targeted || current.targeted)) {
    const pairKey = actionSwitchPairKey(previous, current);
    const recentPair = state.events
      .filter(item => item?.pairKey === pairKey && t - Number(item.at || 0) <= windowMs);
    const reversedEvents = recentPair.filter(item => item?.from?.key === current.key && item?.to?.key === previous.key);
    const reversed = reversedEvents.length > 0;
    const targetChanged = Boolean(current.targeted && previousTarget && previousTarget.key !== current.key);
    const targetChange = targetChanged ? {
      from: previousTarget,
      to: current,
      ageMs: previousTarget.at ? Math.max(0, Math.round(t - Number(previousTarget.at || t))) : null
    } : null;
    event = {
      type: previous.targeted && current.targeted ? 'target-switch' : 'focus-switch',
      at: t,
      tickCount: options.tickCount,
      source: String(options.source || ''),
      from: previous,
      to: current,
      targetChange,
      pairKey,
      pairSwitchCount: recentPair.length + 1,
      oscillating: reversed,
      oscillationSequence: reversed
        ? [...reversedEvents, { at: t, from: previous, to: current }].map(item => ({
            at: item.at,
            from: item.from?.key || '',
            to: item.to?.key || '',
            intervalMs: Math.max(0, t - Number(item.at || t)),
            switchCost: roundedNullable(item.switchDecision?.switchCost)
          }))
        : [],
      switchDecision: buildCandidateSwitchSummary(action),
      previousDecision: buildPreviousDecisionSummary(options.previousDecision || null)
    };
    const snapshot = clone(event) || event;
    state.events.push(snapshot);
    while (state.events.length > historyLimit) state.events.shift();
    state.lastSwitch = snapshot;
    nextAction = { ...action, targetSwitch: snapshot };
    event = snapshot;
  }

  state.lastFocus = current;
  if (current?.targeted) state.lastTargetFocus = current;

  return {
    action: nextAction,
    event,
    focus: current,
    state
  };
}

module.exports = {
  actionSwitchPairKey,
  buildPreviousDecisionSummary,
  buildCandidateSwitchSummary,
  recordActionSwitchDiagnosticsCore
};
