'use strict';

function opportunityClearSource() {
  return `const { shouldClearOpportunityChoiceCore } = require('./src/browser/runtime/opportunity-clear');
`;
}

module.exports = {
  opportunityClearSource
};
