'use strict';

const {
  opportunityChoiceType,
  opportunityChoiceId
} = require('./opportunity-choice');

function shouldClearOpportunityChoiceCore(choice, type, id = null) {
  if (!choice || opportunityChoiceType(choice) !== String(type || '')) return false;
  if (id === null || id === undefined || id === '') return true;
  const choiceId = opportunityChoiceId(choice);
  return String(choiceId) === String(id);
}

module.exports = {
  shouldClearOpportunityChoiceCore
};
