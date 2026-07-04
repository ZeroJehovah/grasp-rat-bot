'use strict';

const {
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
  chooseStableOpportunityCore,
  opportunityMissingHoldUntilCore,
  missingHeldCoinCoveredByVisibleAuthorityCore,
  buildMissingHeldOpportunityCore,
  opportunityRouteIds,
  rememberOpportunityChoiceCore
} = require('./runtime/opportunity-choice');

function opportunityChoiceInlineSource(helpers = {}) {
  const {
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
    chooseStableOpportunityCore,
    opportunityMissingHoldUntilCore,
    missingHeldCoinCoveredByVisibleAuthorityCore,
    buildMissingHeldOpportunityCore,
    opportunityRouteIds,
    rememberOpportunityChoiceCore
  } = helpers;
  const opportunityChoiceHelperSource = [
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
    chooseStableOpportunityCore,
    opportunityMissingHoldUntilCore,
    missingHeldCoinCoveredByVisibleAuthorityCore,
    buildMissingHeldOpportunityCore,
    opportunityRouteIds,
    rememberOpportunityChoiceCore
  ].map(fn => typeof fn === 'function' ? `\t\t\t  ${fn.toString()}` : '').join('\n');
  return String.raw`${opportunityChoiceHelperSource}

			  function opportunityChoiceCoreOptions(extra = {}) {
			    return {
			      dist,
			      sameCoinRadius: opportunitySameCoinRadius(),
			      highValueCoinPriorityAmount: highValueCoinPriorityAmount(),
			      switchMargin: cfg.opportunitySwitchMargin,
			      switchRelativeMargin: cfg.opportunitySwitchRelativeMargin,
			      switchHoldMs: cfg.opportunitySwitchHoldMs,
			      oscillationSwitchLimit: cfg.opportunityOscillationSwitchLimit,
			      nowMs: now(),
			      ...extra
			    };
			  }

		  function resetOpportunitySwitchLock() {
		    bot.opportunitySwitchLock = null;
		  }

			  function lockedOpportunityChoice(sorted) {
			    const result = lockedOpportunityChoiceCore(sorted, bot.opportunitySwitchLock);
			    bot.opportunitySwitchLock = result.switchLock;
			    return result.choice;
			  }

			  function applyOpportunityOscillationLock(sorted, current, chosen) {
			    const result = applyOpportunityOscillationLockCore(sorted, current, chosen, bot.opportunitySwitchLock, opportunityChoiceCoreOptions());
			    bot.opportunitySwitchLock = result.switchLock;
			    return result.chosen;
			  }

		  function opportunitySameCoinRadius() {
		    return Math.max(0, Number(cfg.opportunitySameCoinRadius || cfg.coinCollectedPruneRadius || 900));
		  }

			  function opportunityMatchesChoice(item, choice) {
			    return opportunityMatchesChoiceCore(item, choice, opportunityChoiceCoreOptions());
			  }

			  function opportunityMissingHoldUntil(choice, t) {
			    return opportunityMissingHoldUntilCore(choice, opportunityChoiceCoreOptions({
			      nowMs: t,
			      missingHoldMs: cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs
			    }));
			  }

			  function currentVisibleCoinListForMissingHold() {
			    if (typeof getNativeCoinSources !== 'function') return null;
			    let sources = [];
			    try {
			      sources = getNativeCoinSources();
			    } catch (_) {
			      return null;
			    }
			    if (!Array.isArray(sources) || !sources.length) return null;
			    const visibleSources = sources.filter(source => {
			      if (!source || !Array.isArray(source.list)) return false;
			      const label = String(source.label || '').toLowerCase();
			      return !label.includes('snapshot');
			    });
			    if (!visibleSources.length) return null;
			    const coins = [];
			    for (const source of visibleSources) {
			      for (const raw of source.list) {
			        const coin = normalizeCoinDrop(raw, 'native');
			        if (coin) coins.push(coin);
			      }
			    }
			    return coins;
			  }

			  function visibleCoinSourcesConfirmTargetMissing(target) {
			    const visibleCoins = currentVisibleCoinListForMissingHold();
			    if (!Array.isArray(visibleCoins)) return false;
			    return !visibleCoins.some(coin => coinMatchesTrackedTargetCore(coin, target, coinTargetCoreOptions()));
			  }

			  function missingHeldCoinCoveredByVisibleAuthority(choice, coin) {
			    return missingHeldCoinCoveredByVisibleAuthorityCore(choice, coin, opportunityChoiceCoreOptions({
			      nativeCoinAuthoritativeRadius: typeof snapshotCoinLocalSuppressRadius === 'function' ? snapshotCoinLocalSuppressRadius() : cfg.nativeCoinAuthoritativeRadius
			    }));
			  }

			  function clearMissingVisibleCoinTarget(choice, coin, reason, t) {
			    const id = opportunityChoiceId(choice);
			    const idText = id || id === '0' ? String(id) : '';
			    if (coin) recordCoinFilterDiagnostic(coin, 'visible-missing');
			    if (idText) {
			      const ignoreMs = Math.max(0, Number(cfg.coinCollectedIgnoreMs || 0));
			      if (ignoreMs > 0) bot.ignoredCoins.set(idText, t + ignoreMs);
			      bot.coinAttempts.delete(idText);
			    }
			    if (!idText || (bot.lastTarget?.kind === 'coin' && String(bot.lastTarget.id) === idText)) {
			      bot.lastTarget = null;
			      bot.lastTargetAt = 0;
			    }
			    if (!idText || (bot.coinProgress?.id && String(bot.coinProgress.id) === idText)) bot.coinProgress = null;
			    if (!idText || bot.coinApproachLock?.id === idText) bot.coinApproachLock = null;
			    clearOpportunityChoiceFor('coin', idText || null);
			    bot.lastCoinClearReason = reason;
			    bot.lastMissingVisibleCoin = {
			      id: idText,
			      reason,
			      amount: Number.isFinite(Number(coin?.amount)) ? Math.round(Number(coin.amount)) : null,
			      distance: Number.isFinite(Number(coin?.distance)) ? Math.round(Number(coin.distance)) : null,
			      at: Date.now()
			    };
			  }

			  function buildMissingHeldOpportunity(self, activeThreats, opportunities) {
			    const t = now();
			    const result = buildMissingHeldOpportunityCore(bot.opportunityChoice, opportunities, opportunityChoiceCoreOptions({
			      nowMs: t,
			      self,
			      activeThreats,
			      missingHoldMs: cfg.opportunityMissingHoldMs ?? cfg.opportunitySwitchHoldMs,
			      nativeCoinAuthoritativeRadius: typeof snapshotCoinLocalSuppressRadius === 'function' ? snapshotCoinLocalSuppressRadius() : cfg.nativeCoinAuthoritativeRadius,
			      snapshotCoinMaxDistance: cfg.snapshotCoinMaxDistance,
			      globalCoinMaxDistance: cfg.globalCoinMaxDistance,
			      coinMaxDistance: cfg.coinMaxDistance,
			      visibleSourcesConfirmMissing: choice => visibleCoinSourcesConfirmTargetMissing(choice),
			      ignoredCoin: id => Boolean(bot.ignoredCoins && typeof bot.ignoredCoins.has === 'function' && bot.ignoredCoins.has(String(id))),
			      coinBlockedByThreat: (origin, coin, threat) => {
			        const blocked = coinBlockedByThreat(origin, coin, threat);
			        if (blocked) recordCoinFilterDiagnostic(coin, 'threat-blocked', { threat: coinThreatDiagnostics(threat) });
			        return blocked;
			      },
			      coinStaminaCost: opportunityCoinStaminaCost,
			      coinStaminaAffordable: (origin, coin, staminaCost) => coinStaminaAffordableWithDiagnostic(origin, coin, staminaCost),
			      scoreCoinOpportunity,
			      priorityTier: opportunityPriorityTier
			    }));
			    if (result?.clearMissing) {
			      clearMissingVisibleCoinTarget(bot.opportunityChoice, result.coin, result.clearReason || 'visible-coin-disappeared', t);
			      return null;
			    }
			    const item = result?.opportunity || null;
			    if (!item) return null;
			    const coin = result.coin || item.sourceCoin || item;
			    const { sourceCoin, ...opportunity } = item;
			    return {
			      ...opportunity,
			      action: () => buildCoinAction(self, coin, opportunity.reason, opportunity.actionKind === 'seek-coin' ? 'seek-coin' : null)
			    };
		  }

			  function rememberOpportunityChoice(item, action, previous = bot.opportunityChoice) {
	    if (!item) return action;
	    const result = rememberOpportunityChoiceCore(item, action, previous, opportunityChoiceCoreOptions());
	    bot.opportunityChoice = result.choice;
	    return result.action;
	  }

		  function isHighValueCoinOpportunity(item) {
		    return isHighValueCoinOpportunityCore(item, opportunityChoiceCoreOptions());
		  }

		  function highValueCoinHoldBlocksEnemySwitch(held, best) {
		    return highValueCoinHoldBlocksEnemySwitchCore(held, best, opportunityChoiceCoreOptions());
		  }

		  function chooseStableOpportunity(opportunities) {
		    const result = chooseStableOpportunityCore(opportunities, bot.opportunityChoice, bot.opportunitySwitchLock, opportunityChoiceCoreOptions());
		    bot.opportunitySwitchLock = result.switchLock;
		    return result.chosen;
		  }
`;
}

function bundledOpportunityChoiceSource() {
  return `const {
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
  chooseStableOpportunityCore,
  opportunityMissingHoldUntilCore,
  missingHeldCoinCoveredByVisibleAuthorityCore,
  buildMissingHeldOpportunityCore,
  opportunityRouteIds,
  rememberOpportunityChoiceCore
} = require('./src/browser/runtime/opportunity-choice');

${opportunityChoiceInlineSource()}`;
}

function opportunityChoiceSource(options = {}) {
  if (options.bundledRuntime) return bundledOpportunityChoiceSource(options);
  return opportunityChoiceInlineSource({
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
    chooseStableOpportunityCore,
    opportunityMissingHoldUntilCore,
    missingHeldCoinCoveredByVisibleAuthorityCore,
    buildMissingHeldOpportunityCore,
    opportunityRouteIds,
    rememberOpportunityChoiceCore
  });
}

module.exports = {
  bundledOpportunityChoiceSource,
  opportunityChoiceInlineSource,
  opportunityChoiceSource
};
