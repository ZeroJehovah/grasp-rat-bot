'use strict';

function opportunityClearInlineSource() {
  return String.raw`

		  function clearOpportunityChoiceFor(type, id = null) {
		    const choice = bot.opportunityChoice;
		    if (!choice || opportunityChoiceType(choice) !== String(type || '')) return;
		    if (id === null || id === undefined || id === '') {
		      bot.opportunityChoice = null;
		      resetOpportunitySwitchLock();
		      return;
		    }
		    const choiceId = opportunityChoiceId(choice);
		    if (String(choiceId) === String(id)) {
		      bot.opportunityChoice = null;
		      resetOpportunitySwitchLock();
		    }
		  }`;
}

function bundledOpportunityClearSource() {
  return `const { shouldClearOpportunityChoiceCore } = require('./src/browser/runtime/opportunity-clear');

		  function clearOpportunityChoiceFor(type, id = null) {
		    if (!shouldClearOpportunityChoiceCore(bot.opportunityChoice, type, id)) return;
		    bot.opportunityChoice = null;
		    resetOpportunitySwitchLock();
		  }`;
}

function opportunityClearSource(options = {}) {
  if (options.bundledRuntime) return bundledOpportunityClearSource(options);
  return opportunityClearInlineSource();
}

module.exports = {
  bundledOpportunityClearSource,
  opportunityClearInlineSource,
  opportunityClearSource
};
