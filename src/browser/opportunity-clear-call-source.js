'use strict';

function clearOpportunityChoiceForCall(typeExpr, idExpr = 'null', options = {}) {
  if (options.bundledRuntime) {
    return `if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, ${typeExpr}, ${idExpr})) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }`;
  }
  return `clearOpportunityChoiceFor(${typeExpr}, ${idExpr});`;
}

module.exports = {
  clearOpportunityChoiceForCall
};
