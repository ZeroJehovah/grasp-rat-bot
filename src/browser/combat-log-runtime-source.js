'use strict';

const { combatLogExitSummaryFromDecision } = require('../shared/exit-summary');
const { combatLogSource } = require('./combat-log-source');

function combatLogRuntimeSource() {
  return combatLogSource({ combatLogExitSummaryFromDecision });
}

module.exports = { combatLogRuntimeSource };
