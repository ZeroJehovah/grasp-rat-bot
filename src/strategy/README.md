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
├── coin-motion.js              # Coin pickup motion and metadata core
├── coin-target.js              # Coin target identity and matching core
├── coin-progress.js            # Coin failure backoff and stale escape core
├── coin-route.js               # Coin route planning core
├── combat-constants.js         # Combat system configuration
├── combat-target-selection.js  # Combat target eligibility and priority
├── combat-movement.js          # Combat positioning and dodge
├── combat-fire-discipline.js   # Combat shooting state machine
├── opportunity-choice.js       # Opportunity choice stability/persistence/missing-held core
├── opportunity-candidates.js   # Opportunity candidate construction core
├── post-attack-drop.js         # Post-attack drop coin/wait selection core
├── stamina-budget.js           # Stamina budget summary and selector core
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

#### `coin-motion.js`
Builds coin pickup movement decisions:
- Axis-approach direction selection
- Near-stuck single-axis pickup motion
- Approach-lock hold/release decisions
- Pickup precision pulse timing
- Coin motion metadata summaries

This module is authoritative for coin pickup/motion direction and metadata logic as of `bootstrap-0.4.286`; the browser runtime wrapper still owns `bot.coinApproachLock`, coin failure/progress counters, config access, and action construction.

#### `coin-target.js`
Builds coin target identity and matching decisions:
- Stable coin target keys
- Coin-to-tracked-target ID/radius matching
- Tracked collection target reconstruction
- Native coin snapshot normalization and filtering
- Incidental pickup candidate detection
- Snapshot coin worth/reason helpers

This module is authoritative for coin target identity and matching logic as of `bootstrap-0.4.287`, incidental pickup candidate detection as of `bootstrap-0.4.288`, and snapshot coin worth/reason helper logic as of `bootstrap-0.4.289`; the browser runtime wrapper still owns `bot` state access, native coin source access, normalization, config access, collection side effects, session accounting, snapshot memory writes, and the runtime snapshot-only predicate.

#### `coin-progress.js`
Builds coin progress helper decisions:
- Coin failure ignore/backoff counts
- Reason-specific ignore durations
- Stale coin escape direction away from the current target
- Fallback escape direction phase selection
- Coin-progress intent and attempt expiry checks
- Coin attempt update records and stuck detection
- Coin progress record initialization, improvement, and stale checks
- Ignored coin progress records and patrol action metadata
- Ignored coin cleanup intent

This module is authoritative for coin failure ignore/backoff calculation and stale coin escape direction construction as of `bootstrap-0.4.290`, for coin progress intent/expiry/attempt/progress record update helpers as of `bootstrap-0.4.291`, for ignored progress/action metadata construction as of `bootstrap-0.4.292`, and for ignored cleanup intent as of `bootstrap-0.4.293`; the browser runtime wrapper still owns `bot` state writes, `clearOpportunityChoiceFor()`, config access, and escape direction state writes.

#### `coin-route.js`
Builds native visible coin routes and route-switch guards:
- Route key and route metadata helpers
- Route action metadata construction
- Route leg stamina and safety core functions
- Anchor-based route construction
- Closer-first and held-single-coin guards
- Held route switch hysteresis
- Bounded route candidate selection

This module is authoritative for route planning core logic as of `bootstrap-0.4.278` and route action metadata construction as of `bootstrap-0.4.294`; the browser runtime wrapper still owns config/state access, visible coin filtering, stamina affordability, threat blocking, held opportunity choice lookup, and action construction.

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
- Persisted choice and action metadata construction
- Missing-held opportunity reconstruction

This module is authoritative for opportunity choice stability as of `bootstrap-0.4.279`, choice persistence construction as of `bootstrap-0.4.281`, and missing-held opportunity reconstruction as of `bootstrap-0.4.282`; the browser runtime wrapper still owns `bot.opportunityChoice`, `bot.opportunitySwitchLock`, config access, visible source lookup, stale visible coin cleanup, diagnostics, and action construction.

#### `opportunity-candidates.js`
Builds opportunity candidate descriptors:
- Opportunity value score and priority tiers
- Visible coin de-duplication by id
- Coin route display metadata merge
- Coin and enemy opportunity descriptors
- Best visible coin score including route candidates

This module is authoritative for opportunity candidate construction as of `bootstrap-0.4.280`; the browser runtime wrapper still owns route picking, runtime callbacks, action construction, missing-held cleanup, and persisted opportunity choice state.

#### `post-attack-drop.js`
Builds post-attack drop selections:
- Resolved recent attack filtering
- Visible drop coin-to-attack matching
- postAttackTarget metadata construction
- ROI/min-score and amount gating for post-attack coins
- Visible coin coverage checks around resolved attack targets
- Wait-window and resolve-window filtering
- Drop/action eligibility gates
- Stop/max-distance and threat-blocking gates
- Drop-first target sorting

This module is authoritative for post-attack drop wait target selection as of `bootstrap-0.4.283` and post-attack drop coin matching as of `bootstrap-0.4.284`; the browser runtime wrapper still owns safe coin filtering, stamina diagnostics, attack-history resolution mutation, kill-reward attribution, config access, threat callbacks, and action construction.

#### `stamina-budget.js`
Builds stamina-budget summaries and selectors:
- Daily stamina limiting checks
- Blocked opportunity summaries
- Nearest coin stamina-exit summaries
- Daily-final visible coin selection

This module is authoritative for stamina-budget summary/selector logic as of `bootstrap-0.4.285`; the browser runtime wrapper still owns measured stamina budgets, safe coin filtering, distance/stamina callbacks, relogin delay config, and leave/action construction.

### Testing

#### `self-test.js`
Automated test suite:
- Priority band classification (4 tests)
- Action focus building (1 test)
- Arbitration logic (4 tests)
- Target-switch diagnostics (2 tests)
- Coin diagnostics (2 tests)
- Coin motion direction/pulse/metadata (9 tests)
- Coin target identity/matching/incidental pickup/snapshot helpers (12 tests)
- Coin progress failure/escape/state-transition/ignored-action/cleanup helpers (11 tests)
- Coin route planning/action metadata (4 tests)
- Opportunity choice stability/persistence/missing-held (10 tests)
- Opportunity candidate construction (5 tests)
- Post-attack drop coin/wait selection (6 tests)
- Stamina budget summaries/selectors (4 tests)
- Constants validation (2 tests)
- ROI calculations (2 tests)
- **Total: 78 tests, all passing**

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
8. **Phase 2H**: Opportunity candidate construction integrated into runtime and strategy self-tests
9. **Phase 2I**: Opportunity choice persistence construction integrated into runtime and strategy self-tests
10. **Phase 2J**: Missing-held opportunity construction integrated into runtime and strategy self-tests
11. **Phase 2K**: Post-attack drop wait selection integrated into runtime and strategy self-tests
12. **Phase 2L**: Post-attack drop coin matching integrated into runtime and strategy self-tests
13. **Phase 2M**: Stamina budget summary/selector logic integrated into runtime and strategy self-tests
14. **Phase 2N**: Coin motion direction/pulse/metadata integrated into runtime and strategy self-tests
15. **Phase 2O**: Coin target identity/matching integrated into runtime and strategy self-tests
16. **Phase 2P**: Incidental coin pickup detection integrated into runtime and strategy self-tests
17. **Phase 2Q**: Snapshot coin worth/reason helpers integrated into runtime and strategy self-tests
18. **Next**: Replace additional helpers only in small, provably equivalent slices
19. **Combat replacements**: Require focused replay or targeted self-test evidence before live use

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
