'use strict';

function defaultDist(a, b) {
  const dx = Number(a?.x) - Number(b?.x);
  const dy = Number(a?.y) - Number(b?.y);
  return Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : Infinity;
}

function opportunityKey(item) {
  if (!item) return '';
  return String(item.type || '') + ':' + String(item.id ?? '');
}

function opportunityChoiceType(choice) {
  if (choice?.type) return String(choice.type);
  const key = String(choice?.key || '');
  return key.includes(':') ? key.split(':')[0] : '';
}

function opportunityChoiceId(choice) {
  if (choice?.id !== undefined && choice?.id !== null && choice.id !== '') return String(choice.id);
  const key = String(choice?.key || '');
  const index = key.indexOf(':');
  return index >= 0 ? key.slice(index + 1) : '';
}

function opportunityChoiceKey(choice) {
  if (choice?.key) return String(choice.key);
  const type = opportunityChoiceType(choice);
  const id = opportunityChoiceId(choice);
  return type && id ? type + ':' + id : '';
}

function opportunityPairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('|');
}

function opportunityByKey(opportunities, key) {
  return (opportunities || []).find(item => opportunityKey(item) === key) || null;
}

function opportunityPoint(item) {
  const source = item?.sourceCoin || item?.sourceTarget || item || {};
  const x = Number(source.x ?? item?.x);
  const y = Number(source.y ?? item?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function opportunityReward(item) {
  const source = item?.sourceCoin || item?.sourceTarget || item || {};
  const value = Number(item?.reward ?? source.amount ?? source.drop ?? source.Drop ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function opportunityNetRoiCore(item, extraStaminaCost = 0) {
  if (!item) return null;
  const reward = opportunityReward(item);
  const staminaCost = Number(item.staminaCost);
  if (reward !== null && Number.isFinite(staminaCost) && staminaCost + extraStaminaCost > 0) {
    return reward / (staminaCost + Math.max(0, Number(extraStaminaCost || 0)));
  }
  const score = Number(item.score);
  if (!Number.isFinite(score)) return null;
  if (!(extraStaminaCost > 0) || !(staminaCost > 0)) return score;
  return score * staminaCost / (staminaCost + extraStaminaCost);
}

function opportunitySwitchCostCore(current, next, options = {}) {
  const self = options.self || null;
  const currentPoint = opportunityPoint(current);
  const nextPoint = opportunityPoint(next);
  if (!self || !currentPoint || !nextPoint) return 0;
  const ax = Number(currentPoint.x) - Number(self.x);
  const ay = Number(currentPoint.y) - Number(self.y);
  const bx = Number(nextPoint.x) - Number(self.x);
  const by = Number(nextPoint.y) - Number(self.y);
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  if (!(aLength > 0) || !(bLength > 0)) return 0;
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (aLength * bLength)));
  const reversalFactor = (1 - cosine) / 2;
  const turnDistance = Math.min(aLength, bLength) * reversalFactor;
  const staminaPerCm = Math.max(0, Number(options.moveStaminaPerCm ?? 1));
  const fixedCost = Math.max(0, Number(options.switchFixedStaminaCost ?? 0));
  return turnDistance * staminaPerCm + fixedCost;
}

function applyOpportunitySwitchConfirmationCore(best, held, chosen, switchLock, options = {}) {
  const bestKey = opportunityKey(best);
  const heldKey = opportunityKey(held);
  const chosenKey = opportunityKey(chosen);
  const switchCost = bestKey && heldKey && bestKey !== heldKey
    ? opportunitySwitchCostCore(held, best, options)
    : 0;
  const selectedNetROI = opportunityNetRoiCore(held, 0);
  const bestEligibleNetROI = opportunityNetRoiCore(best, switchCost);
  const diagnostics = {
    selectedNetROI,
    bestEligibleNetROI,
    switchCost,
    netBenefit: selectedNetROI !== null && bestEligibleNetROI !== null ? bestEligibleNetROI - selectedNetROI : null,
    switchAllowed: chosenKey && chosenKey !== heldKey,
    switchBlocked: false,
    bestRejectedReason: ''
  };
  if (!best || !held || bestKey === heldKey || chosenKey === heldKey) {
    if (bestKey && heldKey && bestKey !== heldKey && chosenKey === heldKey) {
      diagnostics.switchAllowed = false;
      diagnostics.switchBlocked = true;
      diagnostics.bestRejectedReason = chosen?.held ? 'hold-or-margin' : 'current-held';
    }
    return {
      chosen,
      switchLock: bestKey === heldKey ? switchLock : { ...(switchLock || {}), pendingKey: '', pendingCount: 0 },
      diagnostics
    };
  }
  if (Number(best.priorityTier || 0) > Number(held.priorityTier || 0)) {
    return { chosen, switchLock: { ...(switchLock || {}), pendingKey: '', pendingCount: 0 }, diagnostics };
  }
  const relativeMargin = Math.max(0, Number(options.switchNetRoiRelativeMargin ?? options.switchRelativeMargin ?? 0));
  if (selectedNetROI !== null && bestEligibleNetROI !== null && bestEligibleNetROI <= selectedNetROI * (1 + relativeMargin)) {
    diagnostics.switchAllowed = false;
    diagnostics.switchBlocked = true;
    diagnostics.bestRejectedReason = 'switch-cost';
    return {
      chosen: { ...held, held: true, switchBlocked: true, competingScore: best.score },
      switchLock: { ...(switchLock || {}), pendingKey: '', pendingCount: 0 },
      diagnostics
    };
  }
  const requiredFrames = Math.max(1, Math.round(Number(options.switchConfirmFrames ?? 1)));
  if (requiredFrames <= 1) return { chosen, switchLock, diagnostics };
  const previous = switchLock || {};
  const pendingCount = previous.pendingKey === bestKey ? Number(previous.pendingCount || 0) + 1 : 1;
  if (pendingCount < requiredFrames) {
    diagnostics.switchAllowed = false;
    diagnostics.switchBlocked = true;
    diagnostics.bestRejectedReason = 'confirmation';
    diagnostics.confirmationFrames = pendingCount;
    diagnostics.confirmationRequired = requiredFrames;
    return {
      chosen: { ...held, held: true, switchBlocked: true, competingScore: best.score },
      switchLock: { ...previous, pendingKey: bestKey, pendingCount, pendingAt: Number(options.nowMs || Date.now()) },
      diagnostics
    };
  }
  diagnostics.confirmationFrames = pendingCount;
  diagnostics.confirmationRequired = requiredFrames;
  return {
    chosen,
    switchLock: { ...previous, pendingKey: '', pendingCount: 0 },
    diagnostics
  };
}

function opportunityMatchesChoiceCore(item, choice, options = {}) {
  if (!item || !choice) return false;
  const key = opportunityKey(item);
  const choiceKey = opportunityChoiceKey(choice);
  if (key && choiceKey && key === choiceKey) return true;
  if (String(item.type || '') !== 'coin' || opportunityChoiceType(choice) !== 'coin') return false;
  const amount = Number(item.amount ?? 0);
  const choiceAmount = Number(choice.amount ?? 0);
  if (amount > 0 && choiceAmount > 0 && Math.round(amount) !== Math.round(choiceAmount)) return false;
  const x = Number(item.x);
  const y = Number(item.y);
  const choiceX = Number(choice.x);
  const choiceY = Number(choice.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(choiceX) || !Number.isFinite(choiceY)) return false;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const sameCoinRadius = Math.max(0, Number(options.sameCoinRadius || 0));
  return dist({ x, y }, { x: choiceX, y: choiceY }) <= sameCoinRadius;
}

function isHighValueCoinOpportunityCore(item, options = {}) {
  return String(item?.type || '') === 'coin'
    && Number(item?.amount || 0) >= Math.max(0, Number(options.highValueCoinPriorityAmount || 0));
}

function highValueCoinHoldBlocksEnemySwitchCore(held, best, options = {}) {
  return Boolean(isHighValueCoinOpportunityCore(held, options) && String(best?.type || '') === 'enemy');
}

function lockedOpportunityChoiceCore(sorted, switchLock) {
  const lock = switchLock || null;
  const lockedKey = String(lock?.lockedKey || '');
  if (!lockedKey) return { choice: null, switchLock: lock };
  const pairKeys = String(lock.pairKey || '').split('|').filter(Boolean);
  if (pairKeys.length === 2 && pairKeys.some(key => !opportunityByKey(sorted, key))) {
    return { choice: null, switchLock: null };
  }
  const locked = opportunityByKey(sorted, lockedKey);
  if (!locked) return { choice: null, switchLock: null };
  const best = sorted[0] || null;
  return {
    choice: {
      ...locked,
      held: true,
      oscillationLocked: true,
      oscillationSwitchCount: Number(lock.switchCount || 0),
      competingScore: best && opportunityKey(best) !== lockedKey ? best.score : locked.competingScore
    },
    switchLock: lock
  };
}

function applyOpportunityOscillationLockCore(sorted, current, chosen, switchLock, options = {}) {
  const locked = lockedOpportunityChoiceCore(sorted, switchLock);
  if (locked.choice) return { chosen: locked.choice, switchLock: locked.switchLock };
  let nextSwitchLock = locked.switchLock;
  if (!chosen) return { chosen, switchLock: nextSwitchLock };
  if (!current) return { chosen, switchLock: null };
  if (opportunityMatchesChoiceCore(chosen, current, options)) return { chosen, switchLock: nextSwitchLock };
  const held = (sorted || []).find(item => opportunityMatchesChoiceCore(item, current, options)) || null;
  if (!held) return { chosen, switchLock: null };
  const fromKey = opportunityKey(held);
  const toKey = opportunityKey(chosen);
  if (!fromKey || !toKey || fromKey === toKey) return { chosen, switchLock: nextSwitchLock };
  const limit = Math.max(0, Number(options.oscillationSwitchLimit || 0));
  if (!limit) return { chosen, switchLock: nextSwitchLock };
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const pairKey = opportunityPairKey(fromKey, toKey);
  const previous = nextSwitchLock || {};
  const continuing = !previous.lockedKey && previous.pairKey === pairKey && previous.lastKey === fromKey;
  const switchCount = continuing ? Number(previous.switchCount || 0) + 1 : 1;
  if (switchCount > limit) {
    nextSwitchLock = { pairKey, lastKey: fromKey, switchCount, lockedKey: fromKey, blockedKey: toKey, lockedAt: t, updatedAt: t };
    return {
      chosen: { ...held, held: true, oscillationLocked: true, oscillationSwitchCount: switchCount, competingScore: chosen.score },
      switchLock: nextSwitchLock
    };
  }
  nextSwitchLock = { pairKey, lastKey: toKey, switchCount, lockedKey: '', blockedKey: '', lockedAt: 0, updatedAt: t };
  return { chosen, switchLock: nextSwitchLock };
}

function chooseStableOpportunityCore(opportunities, current, switchLock, options = {}) {
  const sorted = (opportunities || [])
    .slice()
    .sort((a, b) => b.priorityTier - a.priorityTier
      || b.score - a.score
      || (a.type === b.type ? 0 : (a.type === 'enemy' ? -1 : 1))
      || a.distance - b.distance);
  const best = sorted[0] || null;
  if (!best) return { chosen: null, switchLock, sorted };
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  let chosen = best;
  if (current?.key && t < Number(current.until || 0)) {
    const held = sorted.find(item => opportunityMatchesChoiceCore(item, current, options));
    if (held && !opportunityMatchesChoiceCore(best, current, options)) {
      if (highValueCoinHoldBlocksEnemySwitchCore(held, best, options)) {
        chosen = { ...held, held: true, highValueCoinHold: true, competingScore: best.score };
      } else if (Number(best.priorityTier || 0) <= Number(held.priorityTier || 0)) {
        const margin = Math.max(0, Number(options.switchMargin) || 0);
        const relativeMargin = Math.max(0, Number(options.switchRelativeMargin) || 0);
        const heldScore = Number(held.score || 0);
        const requiredScore = Math.max(heldScore + margin, heldScore * (1 + relativeMargin));
        if (Number(best.score || 0) <= requiredScore) {
          chosen = { ...held, held: true, competingScore: best.score };
        }
      }
    }
  }
  const held = current ? sorted.find(item => opportunityMatchesChoiceCore(item, current, options)) || null : null;
  const confirmed = applyOpportunitySwitchConfirmationCore(best, held, chosen, switchLock, options);
  const locked = applyOpportunityOscillationLockCore(sorted, current, confirmed.chosen, confirmed.switchLock, options);
  if (locked.chosen?.oscillationLocked) {
    confirmed.diagnostics.switchAllowed = false;
    confirmed.diagnostics.switchBlocked = true;
    confirmed.diagnostics.bestRejectedReason = 'oscillation-lock';
  }
  return { chosen: locked.chosen, switchLock: locked.switchLock, sorted, switchDiagnostics: confirmed.diagnostics };
}

function opportunityMissingHoldUntilCore(choice, options = {}) {
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  if (!choice || opportunityChoiceType(choice) !== 'coin') return 0;
  const holdMs = Math.max(0, Number(options.missingHoldMs ?? options.switchHoldMs) || 0);
  const lastSeenAt = Number(choice.lastSeenAt || choice.at || t);
  const until = Math.min(Number(choice.until || 0), lastSeenAt + holdMs);
  return until > t ? until : 0;
}

function missingHeldCoinCoveredByVisibleAuthorityCore(choice, coin, options = {}) {
  const reason = String(choice?.reason || '');
  if (reason.startsWith('snapshot-coin')) return false;
  const distance = Number(coin?.distance ?? choice?.distance);
  const radius = Math.max(0, Number(options.nativeCoinAuthoritativeRadius ?? options.snapshotCoinLocalSuppressRadius ?? 0) || 0);
  const sameCoinRadius = Math.max(0, Number(options.sameCoinRadius || 0));
  return !Number.isFinite(distance) || !(radius > 0) || distance <= radius + sameCoinRadius;
}

function buildMissingHeldOpportunityCore(current, opportunities, options = {}) {
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const holdUntil = opportunityMissingHoldUntilCore(current, options);
  if (!holdUntil) return { opportunity: null, coin: null, clearMissing: false };
  if ((opportunities || []).some(item => opportunityMatchesChoiceCore(item, current, options))) {
    return { opportunity: null, coin: null, clearMissing: false };
  }
  const id = opportunityChoiceId(current);
  if (!id && id !== '0') return { opportunity: null, coin: null, clearMissing: false };
  const x = Number(current.x);
  const y = Number(current.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { opportunity: null, coin: null, clearMissing: false };
  const amount = Math.max(0, Number(current.amount || 0)) || 1;
  const self = options.self || null;
  const dist = typeof options.dist === 'function' ? options.dist : defaultDist;
  const coin = {
    drop_id: id,
    x,
    y,
    amount,
    distance: self ? dist(self, { x, y }) : Number(current.distance || Infinity)
  };
  const visibleMissing = typeof options.visibleSourcesConfirmMissing === 'function'
    ? options.visibleSourcesConfirmMissing(current, coin)
    : Boolean(options.visibleSourcesConfirmMissing);
  if (missingHeldCoinCoveredByVisibleAuthorityCore(current, coin, options) && visibleMissing) {
    return { opportunity: null, coin, clearMissing: true, clearReason: 'visible-coin-disappeared' };
  }
  const ignored = typeof options.ignoredCoin === 'function' ? options.ignoredCoin(id) : Boolean(options.ignoredCoin);
  if (ignored) return { opportunity: null, coin, clearMissing: false, blockReason: 'ignored' };
  const maxDistance = Math.max(
    0,
    Number(current.maxDistance || 0),
    Number(options.snapshotCoinMaxDistance || 0),
    Number(options.globalCoinMaxDistance || 0),
    Number(options.coinMaxDistance || 0)
  );
  if (Number.isFinite(coin.distance) && maxDistance && coin.distance > maxDistance) {
    return { opportunity: null, coin, clearMissing: false, blockReason: 'distance' };
  }
  const coinBlockedByThreat = typeof options.coinBlockedByThreat === 'function' ? options.coinBlockedByThreat : () => false;
  for (const threat of options.activeThreats || []) {
    if (coinBlockedByThreat(self, coin, threat)) {
      return { opportunity: null, coin, clearMissing: false, blockReason: 'threat-blocked', threat };
    }
  }
  const coinStaminaCost = typeof options.coinStaminaCost === 'function' ? options.coinStaminaCost : item => Number(item?.staminaCost ?? item?.distance ?? 0);
  const staminaCost = coinStaminaCost(coin);
  const coinStaminaAffordable = typeof options.coinStaminaAffordable === 'function' ? options.coinStaminaAffordable : () => true;
  if (!coinStaminaAffordable(self, coin, staminaCost)) {
    return { opportunity: null, coin, clearMissing: false, blockReason: 'stamina-unaffordable', staminaCost };
  }
  const coinMaxDistance = Number(options.coinMaxDistance || 0);
  const actionKind = coin.distance <= coinMaxDistance ? 'coin' : 'seek-coin';
  const reason = current.reason || (actionKind === 'coin' ? 'best-opportunity-coin' : 'best-opportunity-visible-coin');
  const scoreCoinOpportunity = typeof options.scoreCoinOpportunity === 'function' ? options.scoreCoinOpportunity : item => Number(item?.opportunityScore ?? current?.score ?? 0);
  const priorityTier = typeof options.priorityTier === 'function' ? options.priorityTier : item => Number(item?.priorityTier || 0);
  const opportunity = {
    type: 'coin',
    id,
    amount,
    x,
    y,
    distance: coin.distance,
    staminaCost,
    score: scoreCoinOpportunity(coin),
    priorityTier: priorityTier({ type: 'coin', distance: coin.distance }),
    actionKind,
    reason,
    maxDistance,
    held: true,
    missingHold: true,
    holdUntil,
    sourceCoin: coin
  };
  return { opportunity, coin, clearMissing: false };
}

function opportunityRouteIds(routeMeta) {
  return Array.isArray(routeMeta?.ids) ? routeMeta.ids.map(id => String(id)).filter(Boolean) : [];
}

function rememberOpportunityChoiceCore(item, action, previous = null, options = {}) {
  if (!item) return { choice: previous || null, action };
  const t = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const key = opportunityKey(item);
  const same = previous && opportunityMatchesChoiceCore(item, previous, options);
  const missingHold = Boolean(item.missingHold);
  const routeMeta = item.coinRoute || action?.coinRoute || action?.target?.coinRoute || null;
  const routeIds = opportunityRouteIds(routeMeta);
  const switchHoldMs = Math.max(0, Number(options.switchHoldMs) || 0);
  const choice = {
    key,
    type: item.type || '',
    id: item.id ?? '',
    at: same ? Number(previous.at || t) : t,
    lastSeenAt: missingHold ? Number(previous?.lastSeenAt || previous?.at || t) : t,
    until: missingHold ? Math.max(t, Number(item.holdUntil || previous?.until || t)) : t + switchHoldMs,
    score: Math.round(Number(item.score || 0)),
    staminaCost: Number.isFinite(Number(item.staminaCost)) ? Math.round(Number(item.staminaCost)) : null,
    reward: Number.isFinite(Number(item.reward)) ? Number(item.reward) : null,
    profitThresholdEligible: item.profitThresholdEligible === undefined ? null : Boolean(item.profitThresholdEligible),
    profitThresholdReason: String(item.profitThresholdReason || ''),
    profitThresholdActive: item.profitThresholdActive === undefined ? null : Boolean(item.profitThresholdActive),
    profitThresholdRewardCoins: Number.isFinite(Number(item.profitThresholdRewardCoins)) ? Number(item.profitThresholdRewardCoins) : null,
    profitThresholdStaminaMilli: Number.isFinite(Number(item.profitThresholdStaminaMilli)) ? Number(item.profitThresholdStaminaMilli) : null,
    reason: action?.reason || item.reason || '',
    x: Number.isFinite(Number(item.x)) ? Number(item.x) : null,
    y: Number.isFinite(Number(item.y)) ? Number(item.y) : null,
    amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : null,
    distance: Number.isFinite(Number(item.distance)) ? Math.round(Number(item.distance)) : null,
    actionKind: item.actionKind || action?.kind || '',
    priorityTier: Number(item.priorityTier || 0),
    maxDistance: Number.isFinite(Number(item.maxDistance)) ? Number(item.maxDistance) : null,
    missingSince: missingHold ? Number(previous?.missingSince || t) : 0,
    oscillationLocked: Boolean(item.oscillationLocked),
    oscillationSwitchCount: Number(item.oscillationSwitchCount || 0),
    coinRouteIds: routeIds.length ? routeIds : null,
    coinRouteValue: Number.isFinite(Number(routeMeta?.value)) ? Math.round(Number(routeMeta.value)) : null,
    coinRouteLegs: Number.isFinite(Number(routeMeta?.legCount)) ? Math.round(Number(routeMeta.legCount)) : null
  };
  return {
    choice,
    action: {
      ...action,
      opportunityChoice: {
        type: choice.type,
        id: choice.id,
        score: choice.score,
        staminaCost: choice.staminaCost,
        reward: choice.reward,
        profitThresholdEligible: choice.profitThresholdEligible,
        profitThresholdReason: choice.profitThresholdReason,
        held: Boolean(item.held),
        highValueCoinHold: Boolean(item.highValueCoinHold),
        missingHold,
        competingScore: Number.isFinite(Number(item.competingScore)) ? Math.round(Number(item.competingScore)) : null,
        holdRemainingMs: Math.max(0, Math.round(Number(choice.until || 0) - t)),
        oscillationLocked: Boolean(item.oscillationLocked),
        oscillationSwitchCount: Number(item.oscillationSwitchCount || 0),
        coinRouteIds: routeIds.length ? routeIds : null,
        coinRouteValue: Number.isFinite(Number(routeMeta?.value)) ? Math.round(Number(routeMeta.value)) : null,
        coinRouteLegs: Number.isFinite(Number(routeMeta?.legCount)) ? Math.round(Number(routeMeta.legCount)) : null,
        routeHeld: Boolean(item.routeHeld),
        competingRouteScore: Number.isFinite(Number(item.competingRouteScore)) ? Math.round(Number(item.competingRouteScore)) : null,
        selectedNetROI: Number.isFinite(Number(action?.opportunitySwitch?.selectedNetROI)) ? Number(action.opportunitySwitch.selectedNetROI) : null,
        bestEligibleNetROI: Number.isFinite(Number(action?.opportunitySwitch?.bestEligibleNetROI)) ? Number(action.opportunitySwitch.bestEligibleNetROI) : null,
        switchCost: Number.isFinite(Number(action?.opportunitySwitch?.switchCost)) ? Math.round(Number(action.opportunitySwitch.switchCost)) : 0,
        netBenefit: Number.isFinite(Number(action?.opportunitySwitch?.netBenefit)) ? Number(action.opportunitySwitch.netBenefit) : null,
        switchAllowed: action?.opportunitySwitch?.switchAllowed !== false,
        switchBlocked: Boolean(action?.opportunitySwitch?.switchBlocked),
        bestRejectedReason: String(action?.opportunitySwitch?.bestRejectedReason || ''),
        confirmationFrames: Number.isFinite(Number(action?.opportunitySwitch?.confirmationFrames)) ? Number(action.opportunitySwitch.confirmationFrames) : null,
        confirmationRequired: Number.isFinite(Number(action?.opportunitySwitch?.confirmationRequired)) ? Number(action.opportunitySwitch.confirmationRequired) : null
      }
    }
  };
}

module.exports = {
  defaultDist,
  opportunityKey,
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityPairKey,
  opportunityByKey,
  opportunityPoint,
  opportunityReward,
  opportunityNetRoiCore,
  opportunitySwitchCostCore,
  applyOpportunitySwitchConfirmationCore,
  opportunityMatchesChoiceCore,
  isHighValueCoinOpportunityCore,
  highValueCoinHoldBlocksEnemySwitchCore,
  lockedOpportunityChoiceCore,
  applyOpportunityOscillationLockCore,
  chooseStableOpportunityCore,
  opportunityMissingHoldUntilCore,
  missingHeldCoinCoveredByVisibleAuthorityCore,
  buildMissingHeldOpportunityCore,
  opportunityRouteIds,
  rememberOpportunityChoiceCore
};
