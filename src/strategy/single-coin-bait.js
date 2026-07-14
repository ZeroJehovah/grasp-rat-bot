'use strict';

const SINGLE_COIN_BAIT_AMOUNT = 1;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function singleCoinBaitIdCore(value) {
  const id = value?.drop_id ?? value?.id ?? value?.coin_id;
  return id === undefined || id === null || id === '' ? '' : String(id);
}

function singleCoinBaitKeyCore(value) {
  if (value?.key) return String(value.key);
  const id = singleCoinBaitIdCore(value);
  if (id) return `id:${id}`;
  const x = finiteNumber(value?.x);
  const y = finiteNumber(value?.y);
  const amount = finiteNumber(value?.amount);
  if (x === null || y === null) return '';
  return `xy:${Math.round(x)}:${Math.round(y)}:${Math.round(amount || 0)}`;
}

function singleCoinBaitDistanceCore(self, coin) {
  const distance = finiteNumber(coin?.distance);
  if (distance !== null) return Math.max(0, distance);
  const sx = finiteNumber(self?.x);
  const sy = finiteNumber(self?.y);
  const cx = finiteNumber(coin?.x);
  const cy = finiteNumber(coin?.y);
  if (sx === null || sy === null || cx === null || cy === null) return Infinity;
  return Math.hypot(cx - sx, cy - sy);
}

function singleCoinBaitMatchesCore(left, right, options = {}) {
  if (!left || !right) return false;
  const leftKey = singleCoinBaitKeyCore(left);
  const rightKey = singleCoinBaitKeyCore(right);
  if (leftKey && rightKey && leftKey === rightKey) return true;
  const leftId = singleCoinBaitIdCore(left);
  const rightId = singleCoinBaitIdCore(right);
  if (leftId && rightId && leftId === rightId) return true;
  if (leftId && rightId) return false;
  const lx = finiteNumber(left.x);
  const ly = finiteNumber(left.y);
  const rx = finiteNumber(right.x);
  const ry = finiteNumber(right.y);
  if (lx === null || ly === null || rx === null || ry === null) return false;
  const radius = Math.max(0, Number(options.sameCoinRadiusCm || 0));
  return Math.hypot(lx - rx, ly - ry) <= radius;
}

function singleCoinBaitRouteIdsCore(opportunity) {
  const source = opportunity?.sourceCoin || opportunity?.coin || opportunity || {};
  const ids = source?.coinRoute?.ids
    ?? opportunity?.coinRoute?.ids
    ?? source?.routeIds
    ?? opportunity?.routeIds;
  return Array.isArray(ids) ? ids.map(id => String(id)).filter(Boolean) : [];
}

function singleCoinBaitSameCoinHasOtherProfitCore(opportunity, bait, options = {}) {
  const source = opportunity?.sourceCoin || opportunity?.coin || opportunity || {};
  const baitId = singleCoinBaitIdCore(bait);
  const routeIds = singleCoinBaitRouteIdsCore(opportunity);
  if (routeIds.some(id => id !== baitId)) return true;
  const routeLegs = finiteNumber(source?.coinRoute?.legCount ?? opportunity?.coinRoute?.legCount ?? source?.routeLegs ?? opportunity?.routeLegs);
  if (routeLegs !== null && routeLegs > 1) return true;
  const baitAmount = Math.max(0, Number(bait?.amount || SINGLE_COIN_BAIT_AMOUNT));
  const aggregateValue = finiteNumber(
    source?.coinRoute?.value
      ?? opportunity?.coinRoute?.value
      ?? source?.routeValue
      ?? opportunity?.routeValue
      ?? source?.fieldAmount
      ?? opportunity?.fieldAmount
  );
  if (aggregateValue !== null && aggregateValue > baitAmount) return true;
  const fieldMembers = finiteNumber(source?.fieldMembers ?? source?.snapshotMembers ?? opportunity?.fieldMembers);
  return fieldMembers !== null && fieldMembers > 1;
}

function singleCoinBaitOtherOpportunityCore(opportunities, bait, options = {}) {
  for (const opportunity of opportunities || []) {
    if (!opportunity || opportunity.profitThresholdEligible === false) continue;
    if (opportunity.missingHold || opportunity.sourceTarget?.cachedNavigationOnly) continue;
    if (String(opportunity.type || '') !== 'coin') return opportunity;
    const source = opportunity.sourceCoin || opportunity.coin || opportunity;
    if (!singleCoinBaitMatchesCore(source, bait, options)) return opportunity;
    if (singleCoinBaitSameCoinHasOtherProfitCore(opportunity, bait, options)) return opportunity;
  }
  return null;
}

function findSingleCoinBaitCoinCore(coins, bait, options = {}) {
  return (coins || []).find(coin => (
    Number(coin?.amount) === SINGLE_COIN_BAIT_AMOUNT
      && singleCoinBaitMatchesCore(coin, bait, options)
  )) || null;
}

function selectedSingleCoinBaitCandidateCore(selectedOpportunity, entryCoins, options = {}) {
  if (!selectedOpportunity || String(selectedOpportunity.type || '') !== 'coin') return null;
  const selected = selectedOpportunity.sourceCoin || selectedOpportunity.coin || selectedOpportunity;
  if (Number(selected?.amount) !== SINGLE_COIN_BAIT_AMOUNT) return null;
  const coin = findSingleCoinBaitCoinCore(entryCoins, selected, options);
  if (!coin) return null;
  if (singleCoinBaitSameCoinHasOtherProfitCore(selectedOpportunity, coin, options)) return null;
  return coin;
}

function summarizeSingleCoinBaitTriggerCore(opportunity) {
  if (!opportunity) return null;
  const source = opportunity.sourceCoin || opportunity.sourceTarget || opportunity.coin || opportunity;
  return {
    type: String(opportunity.type || ''),
    id: singleCoinBaitIdCore(source) || String(source?.user_id ?? source?.userId ?? ''),
    amount: finiteNumber(source?.amount),
    drop: finiteNumber(source?.drop ?? source?.death_drop_coins ?? source?.reward),
    distance: finiteNumber(source?.distance ?? opportunity?.distance),
    reason: String(opportunity.reason || '')
  };
}

function buildSingleCoinBaitStateCore(coin, previous, phase, nowMs, self, trigger = null) {
  const t = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const distance = singleCoinBaitDistanceCore(self, coin);
  const startedAt = Number(previous?.startedAt || t);
  const holdStartedAt = Number(previous?.holdStartedAt || (phase === 'hold' ? t : 0));
  return {
    id: singleCoinBaitIdCore(coin),
    key: singleCoinBaitKeyCore(coin),
    x: finiteNumber(coin?.x),
    y: finiteNumber(coin?.y),
    amount: SINGLE_COIN_BAIT_AMOUNT,
    authority: String(coin?.authority || 'realtime'),
    phase,
    startedAt,
    holdStartedAt,
    lastSeenAt: t,
    releaseAt: phase === 'release' ? Number(previous?.releaseAt || t) : 0,
    distance: Number.isFinite(distance) ? Math.round(distance) : null,
    trigger: phase === 'release'
      ? (previous?.trigger || summarizeSingleCoinBaitTriggerCore(trigger))
      : null
  };
}

function singleCoinBaitPolicyCore(input = {}, options = {}) {
  const enabled = options.enabled !== false;
  const previous = input.previous && typeof input.previous === 'object' ? input.previous : null;
  if (!enabled || !input.self) {
    return {
      state: null,
      phase: '',
      coin: null,
      otherOpportunity: null,
      entered: false,
      transitioned: false,
      clearReason: previous ? (!enabled ? 'disabled' : 'missing-self') : ''
    };
  }
  const matchOptions = {
    sameCoinRadiusCm: options.sameCoinRadiusCm
  };
  const holdRadiusCm = Math.max(0, Number(options.holdRadiusCm || 0));
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : Date.now();
  const visibleCoins = input.visibleCoins || input.realtimeCoins || [];
  const entryCoins = input.entryCoins || input.realtimeCoins || visibleCoins;
  const opportunities = input.opportunities || [];

  if (previous) {
    const coin = findSingleCoinBaitCoinCore(visibleCoins, previous, matchOptions);
    if (!coin) {
      return {
        state: null,
        phase: '',
        coin: null,
        otherOpportunity: null,
        entered: false,
        transitioned: false,
        clearReason: 'bait-missing'
      };
    }
    const otherOpportunity = singleCoinBaitOtherOpportunityCore(opportunities, coin, matchOptions);
    const distance = singleCoinBaitDistanceCore(input.self, coin);
    const phase = previous.phase === 'release' || otherOpportunity
      ? 'release'
      : (distance <= holdRadiusCm ? 'hold' : 'return');
    return {
      state: buildSingleCoinBaitStateCore(coin, previous, phase, nowMs, input.self, otherOpportunity),
      phase,
      coin,
      otherOpportunity,
      entered: false,
      transitioned: phase !== previous.phase,
      clearReason: ''
    };
  }

  if (input.allowEnter === false) {
    return {
      state: null,
      phase: '',
      coin: null,
      otherOpportunity: null,
      entered: false,
      transitioned: false,
      clearReason: ''
    };
  }
  const coin = selectedSingleCoinBaitCandidateCore(input.selectedOpportunity, entryCoins, matchOptions);
  if (!coin) {
    return {
      state: null,
      phase: '',
      coin: null,
      otherOpportunity: null,
      entered: false,
      transitioned: false,
      clearReason: ''
    };
  }
  const otherOpportunity = singleCoinBaitOtherOpportunityCore(opportunities, coin, matchOptions);
  const distance = singleCoinBaitDistanceCore(input.self, coin);
  if (otherOpportunity || distance > holdRadiusCm) {
    return {
      state: null,
      phase: '',
      coin,
      otherOpportunity,
      entered: false,
      transitioned: false,
      clearReason: ''
    };
  }
  return {
    state: buildSingleCoinBaitStateCore(coin, null, 'hold', nowMs, input.self),
    phase: 'hold',
    coin,
    otherOpportunity: null,
    entered: true,
    transitioned: true,
    clearReason: ''
  };
}

module.exports = {
  SINGLE_COIN_BAIT_AMOUNT,
  singleCoinBaitIdCore,
  singleCoinBaitKeyCore,
  singleCoinBaitDistanceCore,
  singleCoinBaitMatchesCore,
  singleCoinBaitRouteIdsCore,
  singleCoinBaitSameCoinHasOtherProfitCore,
  singleCoinBaitOtherOpportunityCore,
  findSingleCoinBaitCoinCore,
  selectedSingleCoinBaitCandidateCore,
  summarizeSingleCoinBaitTriggerCore,
  buildSingleCoinBaitStateCore,
  singleCoinBaitPolicyCore
};
