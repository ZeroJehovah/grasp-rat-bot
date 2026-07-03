# Grasp Rat Bot - Strategy Refactoring Summary

## Phase Notes: Strategy Module Extraction and First Integration

**Date**: 2026-07-02  
**Commit**: `4fcd904` - "Refactor: Extract strategy modules for improved maintainability"

## What Was Done

### Created 8 New Strategy Modules (1,686 lines)

1. **action-priority.js** (105 lines)
   - Priority band hierarchy: exit → safety → combat → profit → recover → wait
   - Action classification and target key extraction

2. **action-arbitration.js** (156 lines)
   - Prevents rapid target oscillation with 480ms hold window
   - Smart priority-based action holding with history tracking

3. **combat-constants.js** (120 lines)
   - Centralized 30+ combat configuration values
   - Range, HP, stamina, fire discipline, and aim parameters
   - Self-validation functions

4. **combat-target-selection.js** (214 lines)
   - Target eligibility filtering (invulnerability, whitelist)
   - Priority scoring (distance, bullets, HP, Drop)
   - Proactive Active combat gates (Drop ≥5, stamina budget)

5. **combat-movement.js** (242 lines)
   - Dynamic combat spacing (4.5-6.5m)
   - 8-direction threat field dodge calculation
   - Movement modifier composition (dodge/back-away/close-in)

6. **combat-fire-discipline.js** (220 lines)
   - 7-state fire state machine (disabled → paused → probe → normal → finish → pressure)
   - Stamina reserve-based shooting gates
   - Retreating edge and low-confidence throttling

7. **opportunity-constants.js** (134 lines)
   - Coin routing and profit system configuration
   - ROI calculation helpers (movement: 1ms/cm, shot: 500ms)
   - Switch margin and hysteresis logic

8. **self-test.js** (183 lines)
   - 13 automated test cases covering all modules
   - **All tests passing** ✓

### Documentation

- **docs/refactoring-notes-2026-07-02.md** - Detailed refactoring rationale and results
- **src/strategy/README.md** - Complete module architecture guide with usage examples

## Validation Results

✅ **Strategy module self-tests**: 13/13 passed  
✅ **Main file self-tests**: 310 cases passed  
✅ **Syntax validation**: Clean  
✅ **Combat log service tests**: Passed  
✅ **Git push**: Success

## Key Benefits

### 1. Maintainability
- Constants centralized in single locations
- Related functions grouped by concern
- Clear module boundaries and responsibilities

### 2. Testability
- Modules testable in isolation
- Clear input/output contracts
- Self-validation functions built-in

### 3. Code Quality
- Self-documenting module names
- JSDoc comments on all functions
- Pure functions without side effects

### 4. Performance
- Zero runtime overhead (direct function calls)
- No additional object creation
- Same execution path as inline code

### 5. Backward Compatibility
- No breaking changes to existing API
- Main file continues working unchanged
- All existing tests pass

## What Was NOT Changed

- **Combat target/movement/fire live logic** - Still uses the proven inline runtime implementation
- **Most decision flow** - No broad replacement of combat/profit/safety execution yet
- **API surface** - All exports unchanged
- **Test coverage** - All 310 existing tests pass

## 2026-07-02 Follow-up: Phase 2C Action Arbitration Integration

Commit pending for `bootstrap-0.4.275` changes the first extracted strategy modules from scaffolding into authoritative runtime code:

- `src/strategy/action-priority.js` now matches the previous browser runtime action band and focus summary implementation, including coin/enemy focus keys, safety focus handling, and diagnostic fields.
- `src/strategy/action-arbitration.js` now owns the final-action hold rules used by the browser runtime and Node self-tests: exits are never held, leave/pending-exit actions are not reusable, same-focus actions are not held, profit cannot hold over new combat/safety, and safety cannot block new combat.
- `grasp-rat-bot.js` still emits a single browser script; the strategy functions are inlined into the generated source instead of using browser-side `require()`.
- `src/node/run-self-test.js` calls the strategy arbitration module directly and includes a strategy-suite summary case.
- The generated browser script now defines `OPPORTUNITY_CONSTANTS`, fixing the prior remote-script bug where high-value coin logic referenced that constant without an injected definition.

Combat target selection, movement, and fire-discipline modules remain conservative reference modules until each live replacement is validated with focused replay or self-test evidence.

## 2026-07-02 Follow-up: Phase 2D Target-Switch Diagnostics Integration

`bootstrap-0.4.276` continues the same equivalence-first migration:

- `src/strategy/action-switch-diagnostics.js` now owns target/focus switch event construction, pair-key calculation, reversed-pair oscillation detection, previous-decision score/stamina summaries, and bounded history updates.
- `grasp-rat-bot.js` keeps the browser wrapper `recordActionSwitchDiagnostics()` and still emits a single remote script by inlining the strategy functions.
- `src/strategy/self-test.js` now has 15 tests, including two target-switch diagnostic cases.
- Static verification checks both the strategy source module and generated remote runtime for the target-switch diagnostic core.

This is still a diagnostics-only migration. Combat target selection, movement, and fire-discipline modules remain staged until separately validated.

## 2026-07-02 Follow-up: Phase 2E Coin Diagnostics Integration

`bootstrap-0.4.277` extracts pure coin diagnostics construction:

- `src/strategy/coin-diagnostics.js` now owns coin summary normalization, nearest realtime coin sorting, ignored/snapshot-only near-coin lists, count fields, and filtered-entry de-duplication.
- The browser runtime still owns config/state access, including `cfg` defaults, `bot.ignoredCoins`, stamina affordability checks, and threat-specific diagnostics.
- `src/strategy/self-test.js` now has 17 tests, including two coin diagnostics cases.
- Static verification checks both the strategy source module and generated remote runtime for the coin diagnostics helpers.

This is a diagnostics/data-shaping migration only; it does not change coin selection or movement decisions.

## 2026-07-03 Follow-up: Phase 2F Coin Route Planner Integration

`bootstrap-0.4.278` extracts the coin route planner core while preserving runtime wrappers:

- `src/strategy/coin-route.js` now owns route keys, route id extraction, route leg cost/safety cores, route point limits, route summaries, route point metadata, anchor route construction, closer-first and held-single-coin guards, held route matching, switch hysteresis, and bounded route picking.
- The browser runtime still owns config/state access, including visible coin filtering, stamina affordability checks, threat blocking callbacks, coin filter diagnostics, and current held opportunity choice lookup.
- `src/strategy/self-test.js` now has 20 tests, including three coin route cases covering route metadata, closer-first guarding, and held route stabilization.
- Static verification checks both the strategy source module and generated remote runtime for the coin route core and wrapper.

This is intended as an equivalent extraction of existing route planning logic; ordinary profit arbitration and action construction remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2G Opportunity Choice Stability Integration

`bootstrap-0.4.279` extracts opportunity choice matching and stability core logic:

- `src/strategy/opportunity-choice.js` now owns opportunity key parsing, previous-choice parsing, same-coin coordinate matching, high-value coin hold checks, switch-margin hold rules, locked-opportunity recovery, and oscillation lock state transitions.
- The browser runtime still owns `bot.opportunityChoice`, `bot.opportunitySwitchLock`, config access, and action construction; wrappers pass runtime state into the strategy core and write the returned switch-lock state back to `bot`.
- `src/strategy/self-test.js` now has 25 tests, including five opportunity choice cases covering key parsing, coordinate matching, margin holds, high-value coin enemy-switch blocking, and oscillation locking.
- Static verification checks both the strategy source module and generated remote runtime for the opportunity choice core and wrapper.

This is intended as an equivalent extraction of the stable-choice layer only; opportunity candidate construction and missing-held cleanup remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2H Opportunity Candidate Construction Integration

`bootstrap-0.4.280` extracts opportunity candidate descriptor construction:

- `src/strategy/opportunity-candidates.js` now owns opportunity value score normalization, priority tiers, visible coin de-duplication by id, coin route display metadata merge, coin/enemy opportunity descriptors, and best visible coin score comparison including route candidates.
- The browser runtime still owns route picking, visible coin filtering callbacks, stamina-affordability diagnostics, enemy pre-filtering, action construction, missing-held cleanup, and persisted `bot.opportunityChoice` state.
- `src/strategy/self-test.js` now has 30 tests, including five opportunity candidate cases covering de-duplication, route metadata preservation, route display merge, enemy action-kind descriptors, and route score comparison.
- Static verification checks both the strategy source module and generated remote runtime for the opportunity candidate core and wrapper.

This is intended as an equivalent extraction of candidate descriptor construction only; action builders, missing-held cleanup, and top-level action selection remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2I Opportunity Choice Persistence Integration

`bootstrap-0.4.281` extracts opportunity choice persistence construction:

- `src/strategy/opportunity-choice.js` now also owns building the persisted choice record and action `opportunityChoice` metadata, including previous-choice continuity, hold windows, missing-held timestamps, route id/value/leg metadata, oscillation flags, high-value hold flags, and route competition fields.
- The browser runtime still owns the `bot.opportunityChoice` state write, config/state access, opportunity action builders, and missing-held cleanup decisions; wrappers pass runtime options into the strategy core and store the returned choice.
- `src/strategy/self-test.js` now has 32 tests, including two persistence cases covering persisted choice/action metadata and missing-held route metadata.
- Static verification checks both the strategy source module and generated remote runtime for the persistence core and wrapper wiring.

This is intended as an equivalent extraction of choice metadata construction only; missing-held validation, action construction, and top-level action selection remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2J Missing-Held Opportunity Integration

`bootstrap-0.4.282` extracts missing-held opportunity reconstruction:

- `src/strategy/opportunity-choice.js` now also owns missing-hold expiry, same-choice suppression, held coin reconstruction, visible-authority clear requests, ignored/distance/threat/stamina gates, and candidate metadata for missing-held coin targets.
- The browser runtime still owns visible source lookup, stale visible coin cleanup, coin/threat/stamina diagnostics, action closures, and `bot` state writes; wrappers pass runtime checks into the strategy core and execute returned clear/action decisions.
- `src/strategy/self-test.js` now has 35 tests, including three missing-held cases covering candidate reconstruction, visible-missing clear requests, and snapshot held-choice preservation.
- Static verification checks both the strategy source module and generated remote runtime for the missing-held core and wrapper wiring.

This is intended as an equivalent extraction of missing-held candidate construction only; top-level opportunity selection and action execution remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2K Post-Attack Drop Wait Integration

`bootstrap-0.4.283` extracts post-attack drop wait target selection:

- `src/strategy/post-attack-drop.js` now owns visible coin coverage checks, wait-window filtering, drop/action eligibility, stop/max-distance gates, threat blocking, and drop-first sorting for post-attack wait targets.
- The browser runtime still owns attack-history resolution state, config access, threat callbacks, and `buildPostAttackDropWaitAction()` action construction.
- `src/strategy/self-test.js` now has 38 tests, including three post-attack drop wait cases covering visible coin coverage, resolved wait target selection, and covered/threat-blocked skips.
- Static verification checks both the strategy source module and generated remote runtime for the post-attack drop wait core and wrapper wiring.

This is intended as an equivalent extraction of target selection only; post-attack drop coin pickup, attack history mutation, and action execution remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2L Post-Attack Drop Coin Integration

`bootstrap-0.4.284` extracts post-attack drop coin matching and candidate metadata:

- `src/strategy/post-attack-drop.js` now also owns resolved recent attack filtering, visible drop coin-to-attack matching, ROI/min-score filtering, postAttackTarget metadata construction, candidate lists, and selected coin sorting.
- The browser runtime still owns safe coin filtering, stamina diagnostics, attack-history resolution mutation, kill-reward attribution via `recordDropMatchedKill()`, config access, and `buildCoinAction()` action construction.
- `src/strategy/self-test.js` now has 41 tests, including three post-attack drop coin cases covering matched visible drops, amount/score/radius filtering, and amount-first selection.
- Static verification checks both the strategy source module and generated remote runtime for the post-attack drop coin core and wrapper wiring.

This is intended as an equivalent extraction of post-attack drop coin selection only; action execution and attribution side effects remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2M Stamina Budget Integration

`bootstrap-0.4.285` extracts stamina-budget summary and selector logic:

- `src/strategy/stamina-budget.js` now owns daily-budget limiting checks, blocked opportunity summary construction, nearest coin stamina-exit summaries, and daily-final visible coin selection.
- The browser runtime still owns measured stamina budget access, safe coin filtering, distance/stamina callbacks, relogin delay config, and leave/action construction.
- `src/strategy/self-test.js` now has 45 tests, including four stamina-budget cases covering daily limiting, blocked summary selection, nearest coin exit summaries, and daily-final visible coin selection.
- Static verification checks both the strategy source module and generated remote runtime for the stamina-budget cores and wrapper wiring.

This is intended as an equivalent extraction of stamina summary/selector logic only; relogin/leave action construction remains in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2N Coin Motion Integration

`bootstrap-0.4.286` extracts coin pickup/motion direction and metadata logic:

- `src/strategy/coin-motion.js` now owns axis approach decisions, near-stuck single-axis pickup motion, approach-lock update intent, pickup precision pulse timing, and coin motion metadata construction.
- The browser runtime still owns `bot.coinApproachLock`, coin failure/progress counters, config access, and action construction.
- `src/strategy/self-test.js` now has 54 tests, including nine coin-motion cases covering axis approach, near-stuck motion, lock release thresholds, pulse tiers, failure slowdown, exact-coordinate stop, stale-lock clearing, and metadata summaries.
- Static verification checks both the strategy source module and generated remote runtime for the coin-motion cores and wrapper wiring.

This is intended as an equivalent extraction of coin pickup/motion computation only; coin progress tracking, ignored-coin state, and action construction remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2O Coin Target Identity Integration

`bootstrap-0.4.287` extracts coin target identity and collection matching logic:

- `src/strategy/coin-target.js` now owns stable coin target key generation, coin-to-tracked-target ID/radius matching, tracked collection target reconstruction, and native coin snapshot normalization/filtering.
- The browser runtime still owns `bot.lastDecision`, `bot.lastTarget`, `bot.coinProgress`, native coin source access, normalization, config access, and collection side effects.
- `src/strategy/self-test.js` now has 59 tests, including five coin-target cases covering key generation, ID/radius matching, decision/progress target reconstruction, and native snapshot filtering.
- Static verification checks both the strategy source module and generated remote runtime for the coin-target cores and wrapper wiring.

This is intended as an equivalent extraction of coin identity/matching logic only; collection confirmation, ignored-coin updates, session accounting, and snapshot pruning remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2P Incidental Coin Pickup Detection

`bootstrap-0.4.288` extends coin target extraction with incidental pickup detection:

- `src/strategy/coin-target.js` now also owns point-to-segment distance, disappeared native coin filtering, memory-window checks, current/self-path distance checks, and incidental pickup candidate metadata.
- The browser runtime still owns native coin source access, session accounting, `bot.lastCoinCollected`, and snapshot memory writes.
- `src/strategy/self-test.js` now has 62 tests, including three incidental pickup cases covering segment distance, current-radius pickup, and self-path pickup.
- Static verification checks both the strategy source module and generated remote runtime for the incidental pickup core and wrapper wiring.

This is intended as an equivalent extraction of incidental pickup candidate selection only; recording session totals and updating bot collection state remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2Q Snapshot Coin Helpers

`bootstrap-0.4.289` extends coin target extraction with snapshot coin helper logic:

- `src/strategy/coin-target.js` now also owns snapshot coin long-travel worth checks for clusters/single coins and snapshot navigation reason selection.
- The browser runtime still owns config access and the runtime `isSnapshotOnlyCoin()` predicate.
- `src/strategy/self-test.js` now has 66 tests, including four snapshot helper cases covering cluster worth, amount-scaled single-coin worth, reason priority, and visible-distance reason selection.
- Static verification checks both the strategy source module and generated remote runtime for the snapshot helper cores and wrapper wiring.

This is intended as an equivalent extraction of small snapshot helpers only; snapshot destination selection remains in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2R Coin Progress Helpers

`bootstrap-0.4.290` extracts pure coin failure/escape helper logic:

- `src/strategy/coin-progress.js` now owns coin failure ignore/backoff calculation and stale coin escape direction construction.
- The browser runtime still owns `bot.coinFailures`, `bot.ignoredCoins`, `bot.staleCoinEscape`, config access, and the larger `trackCoinProgress()` state machine.
- `src/strategy/self-test.js` now has 70 tests, including four coin-progress cases covering ignore count increment/capping, decay, reason-specific bases, target-relative escape, and fallback escape phase selection.
- Static verification checks both the strategy source module and generated remote runtime for the coin-progress cores and wrapper wiring.

This is intended as an equivalent extraction of small coin-progress helpers only; the coin-progress state machine and session/accounting side effects remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2S Coin Progress State Transitions

`bootstrap-0.4.291` extends the coin progress extraction with pure state-transition helpers:

- `src/strategy/coin-progress.js` now also owns coin-progress intent checks, attempt expiry checks, attempt record updates, stuck detection, and progress record initialization/improvement/stale checks.
- The browser runtime still owns `bot.coinAttempts`, `bot.coinProgress`, stale target cleanup, failure-ignore state writes, escape action construction, and the larger `trackCoinProgress()` control flow.
- `src/strategy/self-test.js` now has 74 tests, including four additional coin-progress state cases covering intent/expiry checks, attempt improvement metadata, close-stale detection, and progress initialization/improvement/stale transitions.
- Static verification checks both the strategy source module and generated remote runtime for the additional coin-progress state cores and wrapper wiring.

This is intended as an equivalent extraction of record construction and stale-state decisions only; Map writes, target cleanup, and patrol action construction remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2T Coin Progress Ignored Actions

`bootstrap-0.4.292` extracts ignored coin progress/action construction:

- `src/strategy/coin-progress.js` now also owns ignored coin progress record construction and ignored coin patrol action metadata construction.
- The browser runtime still owns `bot.coinAttempts`, `bot.coinProgress`, `bot.coinFailures`, `bot.ignoredCoins`, `bot.staleCoinEscape`, target cleanup, and escape direction state writes.
- `src/strategy/self-test.js` now has 76 tests, including two additional coin-progress cases covering stuck-ignore record/action metadata and no-progress ignore action metadata staying age-free.
- Static verification checks both the strategy source module and generated remote runtime for the ignored progress/action cores and wrapper wiring.

This is intended as an equivalent extraction of ignore-result object construction only; stale target cleanup and runtime state writes remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2U Ignored Coin Cleanup Intent

`bootstrap-0.4.293` extracts ignored-coin cleanup decisions:

- `src/strategy/coin-progress.js` now also owns ignored-coin cleanup intent for `lastTarget` and `coinApproachLock`.
- The browser runtime uses a small `clearIgnoredCoinRuntimeState()` wrapper for the actual `bot` writes and still owns `clearOpportunityChoiceFor()`.
- `src/strategy/self-test.js` now has 77 tests, including an ignored-cleanup case covering last-target string ID matching and the existing strict approach-lock ID comparison.
- Static verification checks both the strategy source module and generated remote runtime for the cleanup intent core and runtime wrapper wiring.

This is intended as an equivalent extraction of cleanup decisions only; all runtime writes remain in `grasp-rat-bot.js`.

## 2026-07-03 Follow-up: Phase 2V Coin Route Action Metadata

`bootstrap-0.4.294` extracts route metadata construction used by coin actions:

- `src/strategy/coin-route.js` now owns the pure `coinRouteActionMetaCore()` helper for route metadata rounding/defaulting.
- `buildCoinAction()` still owns action construction, movement direction, stamina cost, score, and config-dependent action kind.
- `src/strategy/self-test.js` now has 78 tests, including a route action metadata case covering rounding, point preservation, fallback first distance, and null-route behavior.
- Static verification checks both the strategy source module and generated remote runtime for route action metadata helper wiring.

This is intended as an equivalent extraction of route metadata object construction only; the coin action surface remains in `grasp-rat-bot.js`.

## Next Steps (Not Implemented Yet)

### Phase 2: Integration
1. Action arbitration and focus summary: integrated in `bootstrap-0.4.275`
2. Target-switch diagnostics: integrated in `bootstrap-0.4.276`
3. Coin diagnostics construction: integrated in `bootstrap-0.4.277`
4. Coin route planner core: integrated in `bootstrap-0.4.278`
5. Opportunity choice stability: integrated in `bootstrap-0.4.279`
6. Opportunity candidate construction: integrated in `bootstrap-0.4.280`
7. Opportunity choice persistence construction: integrated in `bootstrap-0.4.281`
8. Missing-held opportunity construction: integrated in `bootstrap-0.4.282`
9. Post-attack drop wait selection: integrated in `bootstrap-0.4.283`
10. Post-attack drop coin matching: integrated in `bootstrap-0.4.284`
11. Stamina budget summary/selector logic: integrated in `bootstrap-0.4.285`
12. Coin motion direction/pulse/metadata logic: integrated in `bootstrap-0.4.286`
13. Coin target identity/matching logic: integrated in `bootstrap-0.4.287`
14. Incidental coin pickup detection: integrated in `bootstrap-0.4.288`
15. Snapshot coin worth/reason helpers: integrated in `bootstrap-0.4.289`
16. Coin progress failure/escape helpers: integrated in `bootstrap-0.4.290`
17. Coin progress state-transition helpers: integrated in `bootstrap-0.4.291`
18. Coin progress ignored action helpers: integrated in `bootstrap-0.4.292`
19. Ignored coin cleanup intent: integrated in `bootstrap-0.4.293`
20. Coin route action metadata: integrated in `bootstrap-0.4.294`
21. Constants: partially integrated for high-value coin defaults
22. Combat/profit/safety helpers: integrate only in small, replay-validated slices
23. Run live validation sessions after each behavior-touching replacement

### Phase 3: Further Extraction
1. Profit/opportunity selection module
2. Safety/avoidance module
3. Movement execution module
4. State management utilities

### Phase 4: Optimization
1. Performance profiling
2. Memory usage analysis
3. Decision tree visualization
4. Hot path optimization

## Risk Assessment

**Low Risk** - This phase only adds new files, doesn't modify existing logic:
- Main file unchanged
- All tests passing
- No behavior changes
- Easy rollback (just don't import modules)

**Future Integration Risk** - Phase 2 will be moderate risk:
- Will modify main decision loop
- Requires offline replay validation
- Must verify no behavior regression
- Should be done incrementally with testing at each step

## Conclusion

Successfully extracted core strategy logic into 8 modular, testable components totaling 1,686 lines of well-documented code. All validation passes. The codebase is now better organized and more maintainable, with clear pathways for future improvements.

The main bot remains fully functional. Action arbitration is now integrated through the strategy modules; the remaining modules are ready for gradual, evidence-backed integration when needed.

---

**Status**: ✅ Phase 1 Complete  
**Commit**: `4fcd904`  
**Files Added**: 10  
**Lines Added**: 1,686  
**Tests**: 13/13 passing  
**Risk Level**: Low (additive changes only)
