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
  const locked = applyOpportunityOscillationLockCore(sorted, current, chosen, switchLock, options);
  return { chosen: locked.chosen, switchLock: locked.switchLock, sorted };
}

module.exports = {
  defaultDist,
  opportunityKey,
  opportunityChoiceType,
  opportunityChoiceId,
  opportunityChoiceKey,
  opportunityPairKey,
  opportunityByKey,
  opportunityMatchesChoiceCore,
  isHighValueCoinOpportunityCore,
  highValueCoinHoldBlocksEnemySwitchCore,
  lockedOpportunityChoiceCore,
  applyOpportunityOscillationLockCore,
  chooseStableOpportunityCore
};
