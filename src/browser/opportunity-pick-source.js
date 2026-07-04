'use strict';

function opportunityPickSource() {
  return `const { pickBestOpportunityCore } = require('./src/browser/runtime/opportunity-pick');`;
}

module.exports = {
  opportunityPickSource
};
