'use strict';

const { actionPriorityBand, actionFocusSummary } = require('./action-priority');

const PROFIT_DROPOUT_REASONS = new Set([
  'dynamic-profit-threshold-wait',
  'no-profitable-candidate'
]);

function profitDropoutMetadata(action) {
  if (!action || typeof action !== 'object') return null;
  const metadata = action.profitDropout && typeof action.profitDropout === 'object'
    ? action.profitDropout
    : null;
  const reason = String(action.reason || '');
  if (!metadata || metadata.yieldable !== true) return null;
  const kind = String(metadata.kind || reason);
  if (!PROFIT_DROPOUT_REASONS.has(kind) || kind !== reason) return null;
  return {
    kind,
    yieldable: true,
    targetValid: metadata.targetValid === true,
    targetValidity: String(metadata.targetValidity || ''),
    thresholdViolation: metadata.thresholdViolation === true,
    targetKey: String(metadata.targetKey || '')
  };
}

function profitActionTargetUsable(action) {
  if (!action || actionPriorityBand(action) !== 'profit' || !action.target) return false;
  if (action.profitThresholdEligible === false || action.expired === true || action.valid === false) return false;
  const target = action.target;
  if (target.alive === false || target.dead === true || target.isDead === true) return false;
  if (target.invulnerable === true || target.isInvulnerable === true) return false;
  const invulnerableMs = Number(target.invulnerableRemainingMs ?? target.invulnerable_remaining_ms);
  if (Number.isFinite(invulnerableMs) && invulnerableMs > 0) return false;
  const hp = Number(target.hp ?? target.knownHp);
  return !Number.isFinite(hp) || hp > 0;
}

function finalActionBandRank(band) {
  switch (String(band || '')) {
    case 'exit': return 600;
    case 'safety': return 500;
    case 'combat': return 400;
    case 'profit': return 300;
    case 'recover': return 200;
    case 'wait': return 100;
    default: return 0;
  }
}

function finalActionReusable(action) {
  if (!action || typeof action !== 'object') return false;
  if (action.kind === 'leave') return false;
  if (action.leave || action.pendingExitIntent) return false;
  const band = actionPriorityBand(action);
  return band === 'safety' || band === 'combat' || band === 'profit';
}

function finalActionCommitmentRank(action) {
  const value = Number(action?.finalCandidate?.commitmentRank ?? action?.commitmentRank ?? 0);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function finalActionHoldDecision(previousAction, previousFocus, currentAction, currentFocus, ageMs, options = {}) {
  const result = (hold, reason = '', detail = {}) => ({ hold, reason, ...detail });
  const holdMs = Math.max(0, Math.round(Number(options.holdMs || 0) || 0));
  const currentDropout = profitDropoutMetadata(currentAction);
  const dropoutAgeMs = Number.isFinite(Number(options.dropoutAgeMs))
    ? Math.max(0, Number(options.dropoutAgeMs))
    : ageMs;
  if (!(holdMs > 0)) return result(false);
  if (!finalActionReusable(previousAction) || !currentAction || !currentFocus || !previousFocus) return result(false);
  if (previousFocus.key === currentFocus.key) return result(false);
  const previousBand = String(previousFocus.band || actionPriorityBand(previousAction));
  const currentBand = String(currentFocus.band || actionPriorityBand(currentAction));
  const effectiveAgeMs = currentDropout && previousBand === 'profit' ? dropoutAgeMs : ageMs;
  if (currentBand === 'exit') return result(false);
  if (previousBand === 'safety' && currentBand !== 'profit') return result(false);
  if (currentAction.urgent === true || currentAction.immediate === true || currentAction.realThreatEvidence === true) return result(false);
  if (previousBand !== 'profit' && effectiveAgeMs > holdMs) return result(false);
  if (previousBand === 'combat' && currentBand === 'safety') {
    const evidence = currentAction.threatEvidence || currentAction.safetyEvidence || {};
    return result(
      !(evidence.recentDamage || evidence.realBulletOwner || evidence.firing || evidence.invulnerableClose),
      'higher-priority-band-stick'
    );
  }
  if (previousBand === 'profit' && currentBand !== 'profit') {
    if (currentAction.expired === true || currentAction.valid === false) return result(false);
    if (!currentDropout || currentDropout.thresholdViolation || currentDropout.targetValid !== true) {
      return result(false);
    }
    if (!profitActionTargetUsable(previousAction)) return result(false);
    const activeDropout = options.activeProfitDropout || null;
    if (activeDropout?.kind && activeDropout.kind !== currentDropout.kind) return result(false);
    const detail = {
      dropoutKind: currentDropout.kind,
      dropoutAgeMs: effectiveAgeMs,
      dropoutTargetKey: currentDropout.targetKey || previousFocus.targetKey,
      targetValid: currentDropout.targetValid,
      targetValidity: currentDropout.targetValidity
    };
    if (effectiveAgeMs > holdMs) {
      return result(false, 'profit-dropout-confirmed', { ...detail, commit: true });
    }
    return result(true, 'profit-dropout-confirmation', detail);
  }
  if (effectiveAgeMs > holdMs) return result(false);
  const previousRank = finalActionBandRank(previousBand);
  const currentRank = finalActionBandRank(currentBand);
  if (previousRank <= 0 || currentRank <= 0) return result(false);
  if (currentRank > previousRank) return result(false);
  if (previousBand === currentBand && previousBand !== 'profit') return result(false);
  if (previousBand === 'profit' && currentBand === 'profit') {
    const previousCommitment = finalActionCommitmentRank(previousAction);
    const currentCommitment = finalActionCommitmentRank(currentAction);
    if (currentCommitment > previousCommitment) return result(false);
    if (previousCommitment > currentCommitment) {
      return result(true, 'higher-commitment-stick', { previousCommitment, currentCommitment });
    }
    const previousRoi = Number(previousAction.finalCandidate?.netROI ?? previousAction.netROI ?? previousAction.roiScore ?? previousAction.score);
    const currentRoi = Number(currentAction.finalCandidate?.netROI ?? currentAction.netROI ?? currentAction.roiScore ?? currentAction.score);
    const switchCost = Math.max(0, Number(currentAction.finalCandidate?.switchCost ?? currentAction.switchCost ?? 0));
    if (Number.isFinite(previousRoi) && Number.isFinite(currentRoi)) {
      const configuredRatio = Number(options.profitSwitchRoiRatio ?? 1);
      const requiredRatio = Math.max(1, Number.isFinite(configuredRatio) ? configuredRatio : 1);
      const tolerance = Math.max(0, Number(options.profitSwitchRoiTolerance ?? 1e-9));
      const requiredCurrentRoi = previousRoi * requiredRatio + tolerance;
      const hold = currentRoi <= requiredCurrentRoi;
      return result(hold, hold
        ? (switchCost > 0 ? 'measured-switch-cost-stick' : 'roi-noise-tolerance')
        : '', {
        previousRoi,
        currentRoi,
        switchCost,
        requiredRatio,
        requiredCurrentRoi,
        improvementRatio: previousRoi > 0 ? currentRoi / previousRoi : null,
        previousCommitment,
        currentCommitment
      });
    }
    return result(true, 'roi-evidence-unavailable');
  }
  if (previousBand === 'safety' && currentBand === 'combat') return result(false);
  return result(true, 'higher-priority-band-stick');
}

function shouldHoldPreviousFinalAction(previousAction, previousFocus, currentAction, currentFocus, ageMs, options = {}) {
  return finalActionHoldDecision(previousAction, previousFocus, currentAction, currentFocus, ageMs, options).hold;
}

function defaultClone(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function applyFinalActionArbitrationCore(action, state, options = {}) {
  if (!state || typeof state !== 'object') {
    state = { lastAction: null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
  }
  if (!Array.isArray(state.history)) state.history = [];

  const clone = typeof options.clone === 'function' ? options.clone : defaultClone;
  const tOption = Number(options.nowMs);
  const t = Number.isFinite(tOption) ? tOption : Date.now();
  const holdMs = Math.max(0, Math.round(Number(options.holdMs ?? options.finalActionArbitrationHoldMs ?? 0) || 0));
  const historyLimit = Math.max(4, Math.round(Number(options.historyLimit ?? options.finalActionArbitrationHistoryLimit ?? 24) || 24));
  const focusBuilder = typeof options.actionFocusSummary === 'function' ? options.actionFocusSummary : actionFocusSummary;

  const currentFocus = focusBuilder(action, { nowMs: t });
  const previousAction = state.lastAction || null;
  const previousFocus = state.lastFocus || null;
  const ageMs = Math.max(0, t - Number(state.lastSelectedAt || 0));
  let selected = action;
  let selectedFocus = currentFocus;
  let override = null;
  let diagnostic = null;

  const holdDecision = finalActionHoldDecision(previousAction, previousFocus, action, currentFocus, ageMs, {
    holdMs,
    profitSwitchRoiRatio: options.profitSwitchRoiRatio,
    profitSwitchRoiTolerance: options.profitSwitchRoiTolerance,
    activeProfitDropout: state.profitDropout || null,
    dropoutAgeMs: profitDropoutMetadata(action)
      ? Math.max(0, t - Number(state.profitDropout?.startedAt || t))
      : ageMs
  });
  if (holdDecision.hold) {
    override = {
      type: 'final-action-arbitration',
      at: t,
      source: String(options.source || ''),
      mode: 'hold-previous',
      ageMs: Math.round(ageMs),
      holdMs,
      holdRemainingMs: Math.max(0, Math.round(holdMs - (holdDecision.dropoutKind
        ? holdDecision.dropoutAgeMs
        : ageMs))),
      from: currentFocus,
      to: previousFocus,
      reason: holdDecision.reason,
      previousNetROI: Number.isFinite(holdDecision.previousRoi) ? holdDecision.previousRoi : null,
      currentNetROI: Number.isFinite(holdDecision.currentRoi) ? holdDecision.currentRoi : null,
      switchCost: Number.isFinite(holdDecision.switchCost) ? holdDecision.switchCost : null,
      requiredImprovementRatio: Number.isFinite(holdDecision.requiredRatio) ? holdDecision.requiredRatio : null,
      requiredCurrentNetROI: Number.isFinite(holdDecision.requiredCurrentRoi) ? holdDecision.requiredCurrentRoi : null,
      previousCommitment: Number.isFinite(holdDecision.previousCommitment) ? holdDecision.previousCommitment : null,
      currentCommitment: Number.isFinite(holdDecision.currentCommitment) ? holdDecision.currentCommitment : null
    };
    if (holdDecision.dropoutKind) {
      override.dropoutKind = holdDecision.dropoutKind;
      override.dropoutAgeMs = Math.round(holdDecision.dropoutAgeMs);
      override.dropoutTargetKey = holdDecision.dropoutTargetKey || null;
      override.targetValid = holdDecision.targetValid === true;
      override.targetValidity = holdDecision.targetValidity || null;
      state.profitDropout = {
        kind: holdDecision.dropoutKind,
        startedAt: state.profitDropout?.kind === holdDecision.dropoutKind
          ? Number(state.profitDropout.startedAt || t)
          : t,
        lastAt: t,
        targetKey: holdDecision.dropoutTargetKey || previousFocus.targetKey || ''
      };
    }
    selected = {
      ...previousAction,
      finalActionArbitration: override
    };
    selectedFocus = previousFocus;
    diagnostic = override;
  } else if (holdDecision.commit) {
    diagnostic = {
      type: 'final-action-arbitration',
      at: t,
      source: String(options.source || ''),
      mode: 'commit-current',
      ageMs: Math.round(ageMs),
      holdMs,
      holdRemainingMs: 0,
      from: previousFocus,
      to: currentFocus,
      reason: holdDecision.reason,
      dropoutKind: holdDecision.dropoutKind,
      dropoutAgeMs: Math.round(holdDecision.dropoutAgeMs),
      dropoutTargetKey: holdDecision.dropoutTargetKey || null,
      targetValid: holdDecision.targetValid === true,
      targetValidity: holdDecision.targetValidity || null
    };
    selected = {
      ...action,
      finalActionArbitration: diagnostic
    };
  }

  if (diagnostic) {
    const snapshot = clone(diagnostic) || diagnostic;
    state.lastOverride = snapshot;
    state.history.push(snapshot);
    while (state.history.length > historyLimit) state.history.shift();
  }
  state.lastAction = clone(selected) || selected;
  state.lastFocus = clone(selectedFocus) || selectedFocus;
  if (!override) state.lastSelectedAt = t;
  if (!override || !profitDropoutMetadata(action)) state.profitDropout = null;

  return {
    action: selected,
    focus: selectedFocus,
    override,
    diagnostic,
    held: Boolean(override),
    state
  };
}

function buildArbitrationStatus(state) {
  if (!state) return null;

  return {
    lastAction: state.lastAction ? {
      kind: state.lastAction.kind,
      reason: state.lastAction.reason
    } : null,
    lastFocus: state.lastFocus ? { ...state.lastFocus } : null,
    lastSelectedAt: state.lastSelectedAt || 0,
    lastOverride: state.lastOverride ? { ...state.lastOverride } : null,
    profitDropout: state.profitDropout ? { ...state.profitDropout } : null,
    history: (state.history || []).slice(-10)
  };
}

function applyFinalActionArbitration(currentAction, previousFinalAction, state, config = {}) {
  if (!state || typeof state !== 'object') {
    state = { lastAction: previousFinalAction || null, lastFocus: null, lastSelectedAt: 0, lastOverride: null, history: [] };
  }
  if (previousFinalAction && !state.lastAction) state.lastAction = previousFinalAction;
  const result = applyFinalActionArbitrationCore(currentAction, state, {
    holdMs: config.finalActionArbitrationHoldMs ?? config.holdMs,
    profitSwitchRoiRatio: config.profitSwitchRoiRatio,
    profitSwitchRoiTolerance: config.profitSwitchRoiTolerance,
    historyLimit: config.finalActionArbitrationHistoryLimit ?? config.historyLimit,
    source: config.source || ''
  });
  return {
    action: result.action,
    held: result.held,
    arbitration: result.diagnostic
  };
}

module.exports = {
  finalActionBandRank,
  finalActionReusable,
  finalActionCommitmentRank,
  finalActionHoldDecision,
  shouldHoldPreviousFinalAction,
  applyFinalActionArbitrationCore,
  applyFinalActionArbitration,
  buildArbitrationStatus,
  profitDropoutMetadata,
  profitActionTargetUsable
};
