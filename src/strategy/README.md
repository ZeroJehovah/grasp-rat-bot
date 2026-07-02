# Strategy Module Architecture

## Overview

The `src/strategy/` directory contains extracted decision-making logic organized by functional area. These modules provide reusable, testable components for the bot's AI system.

## Module Hierarchy

```
src/strategy/
├── action-priority.js          # Action priority band definitions
├── action-arbitration.js       # Final action arbitration logic
├── action-switch-diagnostics.js # Target/focus switch diagnostics
├── coin-diagnostics.js         # Coin diagnostics summaries
├── coin-route.js               # Coin route planning core
├── combat-constants.js         # Combat system configuration
├── combat-target-selection.js  # Combat target eligibility and priority
├── combat-movement.js          # Combat positioning and dodge
├── combat-fire-discipline.js   # Combat shooting state machine
├── opportunity-choice.js       # Opportunity choice stability core
├── opportunity-constants.js    # Profit/coin system configuration
└── self-test.js               # Strategy module test suite
```

## Module Descriptions

### Action System

#### `action-priority.js`
Defines the priority hierarchy for action arbitration:
- **Exit**: Immediate leave/exit actions
- **Safety**: Flee from threats, avoidance
- **Combat**: Combat engagements
- **Profit**: Coin collection, opportunities
- **Recover**: Recovery/waiting
- **Wait**: Idle waiting

This module is authoritative for runtime action focus summaries as of `bootstrap-0.4.275`. The browser runtime inlines the same functions into the generated single-file remote script.

#### `action-arbitration.js`
Prevents rapid target oscillation by holding higher-priority actions for a configured window (default 480ms). Rules:
- Exit is never held back
- Leave/pending-exit actions are not reused as held actions
- Safety can hold over profit
- Safety does not hold back new combat
- Combat can hold over profit/recover
- Profit cannot hold over combat/safety
- Same-focus actions are not treated as switches
- Hold expires after configured time

This module is authoritative for runtime final-action arbitration as of `bootstrap-0.4.275`; Node self-tests call it directly.

#### `action-switch-diagnostics.js`
Builds the final target/focus switch diagnostic events used by combat logs and `status().targetSwitchDiagnostics`:
- Pair-key construction for oscillation windows
- Target-switch vs focus-switch classification
- Reversed-pair oscillation detection
- Previous-decision score/stamina summary
- Bounded event history updates

This module is authoritative for runtime target-switch diagnostics as of `bootstrap-0.4.276`; the browser runtime keeps a small wrapper around the module core.

#### `coin-diagnostics.js`
Builds the diagnostic summaries used for visible/realtime coin filtering:
- Coin summary normalization
- Nearest realtime coin list sorting
- Ignored and snapshot-only near-coin lists
- Filtered-entry de-duplication by coin/reason
- Count fields for visible/realtime coin groups

This module is authoritative for pure coin diagnostics construction as of `bootstrap-0.4.277`; runtime-specific config, ignored-coin storage, stamina-affordability checks, and threat diagnostics stay in the browser wrapper.

#### `coin-route.js`
Builds native visible coin routes and route-switch guards:
- Route key and route metadata helpers
- Route leg stamina and safety core functions
- Anchor-based route construction
- Closer-first and held-single-coin guards
- Held route switch hysteresis
- Bounded route candidate selection

This module is authoritative for route planning core logic as of `bootstrap-0.4.278`; the browser runtime wrapper still owns config/state access, visible coin filtering, stamina affordability, threat blocking, and held opportunity choice lookup.

### Combat System

#### `combat-constants.js`
Centralizes all combat numeric configuration:
- Range thresholds (attack: 14.5m, disengage: 15m, dodge buffer: 1m)
- HP thresholds (critical: 20, low: 60, disadvantage gap: 20)
- Fire discipline (cadence: 160ms, reserve band: 360ms, hard reserve: 1.2s)
- Spacing behavior (close: 4.5m, target: 4.5-6.5m)
- Special windows (opponent probe: 6s, finish pressure, passive runner)

#### `combat-target-selection.js`
Target eligibility and selection:
- `isCombatEligibleThreat()`: Filters invulnerable/whitelisted targets
- `calculateCombatTargetPriority()`: Scores by distance, bullets, HP, Drop
- `checkProactiveActiveCombatGates()`: Drop ≥5 and stamina budget gates
- `selectBestCombatTarget()`: Returns highest priority eligible target
- `isIdleInvulnerable()`: Detects stationary invulnerable (no threat)

#### `combat-movement.js`
Positioning and dodge logic:
- `calculateCombatSpacing()`: Dynamic spacing 4.5-6.5m based on pressure
- `calculateDodgeDirection()`: 8-direction threat field evaluation
- `applyCombatMovementModifiers()`: Combines dodge/back-away/close-in
- `isRecoverableOutOfRangeTarget()`: Reengage eligibility for 14.5-16m targets

#### `combat-fire-discipline.js`
Shooting state machine based on stamina reserves:
- **Disabled**: Below 1.2s hard reserve
- **Paused**: Recovering dodge stamina
- **Probe**: Early engagement (520ms cadence, 5.6s reserve)
- **Finish**: Low threat finish (160ms, 1.8s reserve)
- **Pressure**: Target pressure fire (160ms, 2.4s reserve)
- **Reserve Band**: Low stamina throttle (360ms)
- **Normal**: Standard fire (160ms, 2.4s reserve)

Also handles retreating edge suppression and low-confidence throttling.

### Profit System

#### `opportunity-constants.js`
Profit/coin system configuration:
- Coin distances (near: 8m, foot: 2m, global: 200m)
- Coin routing (min 3 coins, route margins, switch thresholds)
- High value priority (≥10 coins, ≥50 HP)
- AFK targeting (activity cooldown: 12s, stamina cooldown: 60s)
- ROI calculation helpers (1ms/cm movement, 500ms/shot)

#### `opportunity-choice.js`
Builds stable opportunity choice decisions:
- Opportunity key and previous-choice parsing
- Same-coin coordinate matching
- High-value coin hold checks
- Switch-margin hold logic
- Opportunity oscillation lock state transitions

This module is authoritative for opportunity choice stability as of `bootstrap-0.4.279`; the browser runtime wrapper still owns `bot.opportunityChoice`, `bot.opportunitySwitchLock`, config access, and action construction.

### Testing

#### `self-test.js`
Automated test suite:
- Priority band classification (4 tests)
- Action focus building (1 test)
- Arbitration logic (4 tests)
- Target-switch diagnostics (2 tests)
- Coin diagnostics (2 tests)
- Coin route planning (3 tests)
- Opportunity choice stability (5 tests)
- Constants validation (2 tests)
- ROI calculations (2 tests)
- **Total: 25 tests, all passing**

## Usage Example

```javascript
// In main decision loop (grasp-rat-bot.js)

const { applyFinalActionArbitration, buildArbitrationStatus } = require('./src/strategy/action-arbitration');
const { COMBAT_CONSTANTS } = require('./src/strategy/combat-constants');
const { selectBestCombatTarget } = require('./src/strategy/combat-target-selection');
const { determineCombatFireState } = require('./src/strategy/combat-fire-discipline');

// Select combat target
const target = selectBestCombatTarget(self, combatCandidates, {
  whitelistCheck: (entity) => targetWhitelistState.nameSet.has(entity.name),
  incomingBulletOwnerId: safetyIncomingBullet?.ownerId,
  recentInjury: bot.recentInjury,
  opportunityStaminaBudget: remainingStaminaBudget
});

// Determine fire state
const fireState = determineCombatFireState(self, target, {
  opponentProbe: !target.realBulletEvidenceSeenMs,
  finishLowThreat: target.hp < 75 && self.hp > 60,
  passiveRunner: isPassiveRunner(target),
  targetPressureFire: hasRealBulletPressure(target)
});

// Apply arbitration in a Node context
const { action, held, arbitration } = applyFinalActionArbitration(
  currentAction,
  bot.lastFinalAction,
  bot.finalActionArbitrationState,
  { finalActionArbitrationHoldMs: 480 }
);

// Use arbitrated action
if (held) {
  action.finalActionArbitration = arbitration;
}
executeAction(action);
```

## Integration Strategy

1. **Phase 1**: Modules created, self-tests passing
2. **Phase 2A/2B**: Constants imported and high-value coin defaults migrated
3. **Phase 2C**: Action focus and final-action arbitration integrated into runtime and self-tests
4. **Phase 2D**: Target-switch diagnostics integrated into runtime and strategy self-tests
5. **Phase 2E**: Coin diagnostics construction integrated into runtime and strategy self-tests
6. **Phase 2F**: Coin route planner core integrated into runtime and strategy self-tests
7. **Phase 2G**: Opportunity choice stability integrated into runtime and strategy self-tests
8. **Next**: Replace additional helpers only in small, provably equivalent slices
9. **Combat replacements**: Require focused replay or targeted self-test evidence before live use

## Design Principles

- **Pure functions where possible**: Easier to test and reason about
- **Clear contracts**: JSDoc comments document parameters/returns
- **No side effects**: Modules don't modify global state
- **Composable**: Functions can be combined in different ways
- **Self-documenting**: Module/function names describe purpose
- **Testable**: Each module has dedicated test coverage

## Backward Compatibility

- Action focus/arbitration modules are now runtime sources of truth
- Combat/profit modules are additive until separately validated
- Main file still emits a single browser runtime without `require()`
- No breaking changes to existing API
- Gradual migration path with validation at each step

## Performance Considerations

- No runtime overhead (direct function calls)
- Constants remain in memory after first require
- No additional object creation vs inline code
- Same execution path as before

## Future Enhancements

1. **Profit Module**: Continue extracting opportunity selection around the coin route wrapper
2. **Safety Module**: Extract flee/avoidance logic
3. **State Management**: Centralize bot state handling
4. **Decision Tree**: Explicit decision tree structure
5. **Replay System**: Integrate with combat log replay validation
