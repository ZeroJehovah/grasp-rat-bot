'use strict';

const { combatLogExitSummaryFromDecision } = require('./runtime/exit-summary');
const { combatLogSource } = require('./combat-log-source');

function bundledCombatLogRuntimeSource() {
  return `const { combatLogExitSummaryFromDecision } = require('./src/browser/runtime/exit-summary');

${combatLogSource()}`;
}

function combatLogRuntimeSource(options = {}) {
  if (options.bundledRuntime) return bundledCombatLogRuntimeSource();
  return combatLogSource({ combatLogExitSummaryFromDecision });
}

module.exports = {
  bundledCombatLogRuntimeSource,
  combatLogRuntimeSource
};
