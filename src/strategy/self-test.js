'use strict';

/**
 * Strategy Module Self-Tests
 *
 * Tests for the extracted strategy modules to ensure correctness.
 */

const { ACTION_PRIORITY_BANDS, getActionPriorityBand, buildActionFocus } = require('./action-priority');
const { applyFinalActionArbitration } = require('./action-arbitration');
const { COMBAT_CONSTANTS, validateCombatConstants } = require('./combat-constants');
const { OPPORTUNITY_CONSTANTS, calculateOpportunityROI, validateOpportunityConstants } = require('./opportunity-constants');

function runStrategyModuleSelfTests() {
  const results = [];

  // Test action priority bands
  results.push({
    name: 'action-priority-exit',
    passed: getActionPriorityBand({ kind: 'leave' }) === ACTION_PRIORITY_BANDS.exit
  });

  results.push({
    name: 'action-priority-safety',
    passed: getActionPriorityBand({ kind: 'flee' }) === ACTION_PRIORITY_BANDS.safety
  });

  results.push({
    name: 'action-priority-combat',
    passed: getActionPriorityBand({ kind: 'combat' }) === ACTION_PRIORITY_BANDS.combat
  });

  results.push({
    name: 'action-priority-profit',
    passed: getActionPriorityBand({ kind: 'coin' }) === ACTION_PRIORITY_BANDS.profit
  });

  // Test action focus building
  const testAction = {
    kind: 'coin',
    reason: 'test-coin',
    target: { id: 'test123', x: 1000, y: 2000 }
  };
  const focus = buildActionFocus(testAction);
  results.push({
    name: 'action-focus-build',
    passed: focus && focus.kind === 'coin' && focus.targetKey === 'test123'
  });

  // Test arbitration - safety over profit
  const safetyAction = { kind: 'flee', reason: 'test-flee' };
  const profitAction = { kind: 'coin', reason: 'test-coin' };

  const state1 = {
    lastAction: safetyAction,
    lastFocus: buildActionFocus(safetyAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb1 = applyFinalActionArbitration(
    profitAction,
    safetyAction,
    state1,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-safety-holds-over-profit',
    passed: arb1.held && arb1.action.kind === 'flee'
  });

  // Test arbitration - combat over profit (should hold)
  const combatAction = { kind: 'combat', reason: 'test-combat' };
  const state2 = {
    lastAction: combatAction,
    lastFocus: buildActionFocus(combatAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb2 = applyFinalActionArbitration(
    profitAction,
    combatAction,
    state2,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-combat-holds-over-profit',
    passed: arb2.held && arb2.action.kind === 'combat'
  });

  // Test arbitration - profit does not hold over combat
  const state3 = {
    lastAction: profitAction,
    lastFocus: buildActionFocus(profitAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb3 = applyFinalActionArbitration(
    combatAction,
    profitAction,
    state3,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-profit-does-not-hold-over-combat',
    passed: !arb3.held && arb3.action.kind === 'combat'
  });

  // Test arbitration - exit never held
  const exitAction = { kind: 'leave', reason: 'test-exit' };
  const state4 = {
    lastAction: combatAction,
    lastFocus: buildActionFocus(combatAction),
    lastSelectedAt: Date.now() - 100,
    lastOverride: null,
    history: []
  };

  const arb4 = applyFinalActionArbitration(
    exitAction,
    combatAction,
    state4,
    { finalActionArbitrationHoldMs: 480 }
  );

  results.push({
    name: 'arbitration-exit-never-held',
    passed: !arb4.held && arb4.action.kind === 'leave'
  });

  // Test combat constants validation
  const combatErrors = validateCombatConstants();
  results.push({
    name: 'combat-constants-valid',
    passed: combatErrors.length === 0,
    errors: combatErrors
  });

  // Test opportunity constants validation
  const opportunityErrors = validateOpportunityConstants();
  results.push({
    name: 'opportunity-constants-valid',
    passed: opportunityErrors.length === 0,
    errors: opportunityErrors
  });

  // Test opportunity ROI calculation
  const roi1 = calculateOpportunityROI(10, 1000);
  results.push({
    name: 'opportunity-roi-basic',
    passed: Math.abs(roi1 - 0.01) < 0.001
  });

  const roi2 = calculateOpportunityROI(10, 0);
  results.push({
    name: 'opportunity-roi-zero-cost',
    passed: roi2 === Infinity
  });

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    passed,
    failed,
    total: results.length,
    results,
    success: failed === 0
  };
}

module.exports = {
  runStrategyModuleSelfTests
};
