'use strict';

function clearOpportunityChoiceForCall(typeExpr, idExpr = 'null') {
  return `if (shouldClearOpportunityChoiceCore(bot.opportunityChoice, ${typeExpr}, ${idExpr})) {
        bot.opportunityChoice = null;
        resetOpportunitySwitchLock();
      }`;
}

module.exports = {
  clearOpportunityChoiceForCall
};
