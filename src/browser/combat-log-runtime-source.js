'use strict';

const { combatLogSource } = require('./combat-log-source');

function combatLogRuntimeSource() {
  return `const { combatLogExitSummaryFromDecision } = require('./src/browser/runtime/exit-summary');

${combatLogSource()}`;
}

module.exports = {
  combatLogRuntimeSource
};
