# Grasp Rat Bot - Strategy Refactoring Summary

## 2026-07-05 Follow-up: Runtime State Bindings

`bootstrap-0.4.505` collapses the small state/persistence fragment group into a real runtime binding module:

- `src/browser/runtime/runtime-state-bindings.js` creates the runtime-local accessors for persistent last-self, persistent exit, persistent clear, pending-exit persistence helpers, exit-detail refresh, restored coin failures/runtime state, login snapshot gate helpers, and runtime diagnostics.
- `src/browser/runtime-state-bindings-source.js` is now the single source fragment for that group.
- `src/browser/runtime-fragment-registry.js` now inserts one `runtime-state-bindings` fragment instead of nine small state fragments.
- The obsolete `persistent-*-source.js`, `pending-exit-persistence-source.js`, `refresh-exit-detail-source.js`, `restored-*-source.js`, `login-snapshot-gate-source.js`, and `runtime-diagnostics-source.js` files are removed.
- Static verification checks the new module boundary and rejects obsolete state source factories in the registry; the runtime helper-entry smoke test imports and executes `runtime-state-bindings`.
- The production dist records manifest SHA-256 `4ad32992473c2eb28ca350b866d52674063c9334e064e52546d3141b8bde05d2` with direct source SHA-256 `a32c7e524af527eb5721a4b1f0ddd47ec46ad42ec0652a51377cdd1206f630b9`.

## 2026-07-05 Follow-up: Runtime Shell Boundary

`bootstrap-0.4.504` moves the runtime IIFE shell out of the fragment registry and into the runtime-source boundary:

- `src/browser/runtime-source.js` now exposes `browserRuntimeBodySource(options)` for the rendered fragment body and `wrapBrowserRuntimeIife(source)` for the browser IIFE shell.
- `browserRuntimeSource(options)` composes the body source with the wrapper, preserving the generated runtime shape.
- `src/browser/runtime-fragment-registry.js` no longer owns `runtime-iife-open` or `runtime-iife-close`; it now holds only ordered runtime fragments and separator fragments.
- Static verification checks the new body/wrapper boundary and rejects IIFE shell entries in the registry.
- The production dist records manifest SHA-256 `f3f6604929cc44c7aa883c19d4c93704005d283fa09d4adc0ea396a1e05c53c1` with direct source SHA-256 `a7f7cd6022213b6ebcf2c5e0e8209725cdd1b023a3282953173a9186a55f6b8e`.

## 2026-07-05 Follow-up: Runtime Helper Entry Promotion

`bootstrap-0.4.503` removes the last dedicated bundler-spike source directory and promotes its smoke test into the browser runtime tree:

- `src/bundler-spike/runtime-entry.mjs` moves to `src/browser/runtime-helper-entry.mjs`, using `./runtime/*` and `./page-global-core.js` imports from the browser runtime directory.
- `scripts/build-bundler-spike.js` is renamed to `scripts/build-runtime-helper-entry.js`.
- Root package scripts now expose `npm run build:runtime-helper-entry` / `npm run test:runtime-helper-entry`.
- Static verification checks the new helper entry path, package commands, helper-entry global/config keys, page-global adapter use, and esbuild IIFE smoke-test build.
- The production dist records manifest SHA-256 `156109b6e5b474d4a69733b9c6d6da7a2c1adc10c06d9369792004d5192f9b19` with direct source SHA-256 `f608b33be993481451ae7ba082a1c4a9a5a21bacec082a2d20bca7a403f21db9`.

## 2026-07-05 Follow-up: Runtime Entry Source Boundary

`bootstrap-0.4.502` moves production/local runtime entry construction behind a browser-owned entry-source module:

- `src/browser/runtime-entry-source.js` now owns `remoteRuntimeEntrySource(options)` and `runtimeEvalEntrySource(options)`.
- `scripts/remote-bot-bundle.js` now bundles entry sources from that module instead of importing `src/browser/runtime-source.js` directly or constructing the eval `export default` wrapper inline.
- Production manifest mode is now `production-runtime-entry-source`; the non-production candidate mode is `runtime-entry-source-candidate`.
- `scripts/verify-objective-build.js` checks the entry-source boundary, prevents the shared bundler from bypassing it, and still verifies the virtual-entry esbuild path, local eval startup result, generated/dist hash alignment, and unresolved-import rejection.
- The production dist records manifest SHA-256 `020b5c6c468c4fe21da06766070929287d572a0ba3e554d5cd3f55d954528f29` with direct source SHA-256 `5445ff4548b1bd55dd2f72637cd233b25d04901586b5dd2bd67ee3755055ea8f`.

## 2026-07-05 Follow-up: Runtime Fragment Registry Split

`bootstrap-0.4.501` splits the ordered browser runtime fragment provider graph from the fragment materializer:

- `src/browser/runtime-fragment-registry.js` now owns all browser runtime fragment provider imports and the ordered `browserRuntimeFragmentEntries(config)` tuple list.
- `src/browser/runtime-fragments-source.js` now owns only the named fragment contract, validation, materialization, and final fragment composition. It drops from 300 lines to 33 lines.
- `scripts/verify-objective-build.js` checks the registry/materializer boundary, rejects provider imports in the materializer, requires the materializer to import the registry, and still verifies explicit fragment materialization plus generated/dist hash alignment.
- The production dist records manifest SHA-256 `95be4880f5a6cc53b46a8ddbc64369da9476b777adcc7e35b55b0b959273f730` with direct source SHA-256 `a9527de3aa4213e7a942794a3dcd033ba12cc5177f41eedc820ab4f2f2801863`.

## 2026-07-05 Follow-up: Virtual Entry Bundler Migration

`bootstrap-0.4.500` moves the shared remote bundler to esbuild virtual entry modules:

- `scripts/remote-bot-bundle.js` now defines named remote/eval virtual entries and loads generated source through an esbuild plugin with repo-root `resolveDir`, instead of using `stdin`.
- Because esbuild plugins require the async API, `writeRemoteBotBundle()`, `bundledRemoteSourceFor()`, `browserRuntimeEvalSourceFor()`, and the production/local callers now await bundle generation.
- `scripts/verify-objective-build.js` checks the virtual entry namespace, plugin `onResolve` / `onLoad`, explicit `entryPoints`, absence of `stdin:`, async local eval generation, and the generated/dist hash match.
- The production dist records manifest SHA-256 `7f3bd8603c5a483036b56a4bc6e0fcd03d0dc6c62afef8e11ad0751b7dc8d3b4` with direct source SHA-256 `7843254be429d5f18d6dab19a84e2fe3891772210d7f4cf0bcb6c04a2b242403`.

## 2026-07-04 Follow-up: Bundled-Only Browser Source Migration

`bootstrap-0.4.499` completes the aggressive browser-source-generation cleanup after the esbuild migration:

- `src/browser/*.js` source modules now generate bundled-only runtime fragments. The old `*InlineSource` / `bundled*Source` compatibility selectors and optional `options.bundledRuntime` branches are removed from migrated browser source modules.
- Browser source fragments now expose helper dependencies directly to esbuild through `require('./src/browser/runtime/...')`. Runtime adapters under `src/browser/runtime/` remain the browser boundary for strategy/shared helpers.
- `grasp-rat-bot.js` is no longer treated as browser runtime text. It stays the Node/CDP CLI entry, while runtime behavior verification is anchored to the generated direct runtime and final `dist/grasp-rat-remote-bot.js`.
- `scripts/verify-objective-build.js` now checks both sides of the new boundary: source-module shape for bundled-only fragment generation, and generated/dist products for behavior text, final direct-core calls, manifest hashes, bundler metadata, and absence of unresolved runtime imports.
- The production dist still bundles through esbuild and records manifest SHA-256 `8a00ebd284885d137ac25fb98ea6cce9b8b68cb61c17bdd2dcdd7b23ef6fb970` with direct source SHA-256 `4f5063cd87ef599e28f90dcb6e2912e1f6b1b77a9af0d87ea0ef3b873e442d65`.

This intentionally drops the conservative local inline compatibility layer in favor of the structurally cleaner bundled-only architecture.

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

## 2026-07-03 Follow-up: Phase 2W Browser Source Builder Extraction

`bootstrap-0.4.295` changes the build/source organization rather than strategy behavior:

- `src/browser/bot-source.js` now owns the large `browserBotSource(config)` generator and the browser-runtime source-generation imports.
- `grasp-rat-bot.js` now keeps only the Node/CDP CLI, status/diagnose flow, `--print-source` wrapper, and self-test delegation. Its line count drops from `13081` to `320`.
- `scripts/build-remote-bot.js` now calls `browserBotSource()` directly instead of running `grasp-rat-bot.js --print-source`, reducing build coupling to the CLI entrypoint.
- A fixed-version `--print-source` baseline was byte-for-byte identical before and after the extraction, and the direct build output matched that same baseline.
- `scripts/verify-objective-build.js` now treats `src/browser/bot-source.js` as the canonical browser source builder and regenerates the remote script through the direct module path.

This is intended as an equivalent structural split only; the generated remote bot remains a single browser script and strategy behavior is unchanged apart from the release version string.

## 2026-07-03 Follow-up: Phase 2X Bundler Spike and Production Switch

The first bundler spike proved the module/global-adapter path, then `bootstrap-0.4.296` switched production remote generation to the shared esbuild wrapper:

- Root `package.json` now pins `esbuild` and exposes `npm run build:bundler-spike` / `npm run test:bundler-spike`.
- `src/bundler-spike/runtime-entry.mjs` is a small ordinary browser module that imports existing shared/strategy CommonJS modules through ESM syntax.
- `src/browser/page-global-core.js` centralizes page-global access for `window` / `globalThis` resolution, config reads, global installation, and localStorage JSON reads. It was introduced from the spike adapter path and is now shared by the spike and generated runtime.
- `scripts/build-bundler-spike.js` builds that entry as a readable browser IIFE with `format: 'iife'`, `platform: 'browser'`, and `globalName: '__graspRatBundlerSpikeBundle'`.
- The spike self-test builds into a temp directory, rejects unresolved relative `require()` / `import` paths, checks that shared/runtime/display/target-whitelist/action-priority/page-adapter helpers are bundled, and executes the output in a VM through both `globalThis.__graspRatBundlerSpike.status()` and `window.__graspRatBundlerSpike.status()`.
- `scripts/remote-bot-bundle.js` now centralizes `browserBotSource()` generation, esbuild IIFE wrapping, direct/bundled SHA-256 calculation, manifest bundler metadata, and output writes.
- `scripts/build-remote-bot.js` now writes the production `dist/grasp-rat-remote-bot.js` and `dist/manifest.json` through the shared bundler with `production: true`, `mode: production-full-generated-remote`, and a recorded direct-source hash.
- `scripts/build-remote-bot-bundled.js` remains a non-production candidate/self-test path, but it now reuses the same shared bundler instead of carrying a parallel esbuild implementation.
- `scripts/verify-objective-build.js` regenerates both direct and bundled production sources, requires the final dist to match the regenerated bundle hash, checks production bundler metadata and direct-source hash, parses the bundled dist with `vm.Script`, rejects unresolved relative imports/requires and CommonJS exports in the final dist, and keeps behavior/static source checks anchored to the canonical direct generated source.

This switches the production build path without converting the large runtime slices into true browser ESM modules yet. Future extraction can still move selected browser/shared helpers toward real ESM ownership, but the release artifact is now produced by esbuild instead of the old raw source write.

## 2026-07-03 Follow-up: Phase 2Y Browser Runtime Source Boundary

`bootstrap-0.4.297` adds a small browser runtime source boundary ahead of the old source generator:

- `src/browser/runtime-source.js` now owns runtime config normalization plus `browserRuntimeSource()` and `remoteBrowserRuntimeSource()` entrypoints.
- `grasp-rat-bot.js` uses `browserRuntimeSource()` for both CDP injection and `--print-source`, so the CLI no longer imports `src/browser/bot-source.js` directly.
- `scripts/remote-bot-bundle.js` uses `remoteBrowserRuntimeSource()` for the direct source fed to esbuild, so the production bundler no longer imports `src/browser/bot-source.js` directly.
- `src/browser/bot-source.js` remains the internal legacy source generator for now; it is isolated behind the new boundary until later slices can replace generated source with true browser module ownership.
- Static verification checks this boundary, the absence of direct `bot-source.js` imports from the CLI and production bundler, and the regenerated bundled dist.

This is an equivalent build/source-boundary migration only. It does not change strategy behavior, but it creates a stable interface for replacing the current full-source generator with a real browser runtime entry in later steps.

## 2026-07-03 Follow-up: Phase 2Z Page-Global Core Integration

`bootstrap-0.4.298` graduates the page-global adapter from a spike-only helper into real browser runtime source:

- `src/browser/page-global-core.js` now owns `resolvePageGlobal()`, `readPageGlobal()`, `installPageGlobal()`, `readPageLocalStorageJson()`, and `browserPageGlobalSource()`.
- `src/bundler-spike/runtime-entry.mjs` imports the shared browser page-global core, so the spike no longer owns a separate adapter file.
- `src/browser/bot-source.js` injects `browserPageGlobalSource()` into the generated runtime and uses it for runtime config reads, previous bot lookup, bot installation, and pause globals.
- `scripts/build-remote-bot-bundled.js` and `scripts/verify-objective-build.js` now check adapter-based bot installation instead of the old direct `window[BOT_KEY] = bot` assignment.
- The generated production dist still remains single-file and does not contain CommonJS exports or unresolved relative imports.

This is a small real-runtime migration slice. It does not remove every direct `window` access yet; remaining page-global reads inside larger browser fragments should be migrated through this shared core in later validated steps.

## 2026-07-03 Follow-up: Phase 2AA Control Login Page-Global Guards

`bootstrap-0.4.299` continues the page-global adapter migration inside `src/browser/control-login-source.js`:

- Post-login zoom delayed callbacks now check the installed bot identity through `readPageGlobal(BOT_KEY, null, pageGlobal)` instead of direct `window[BOT_KEY]` reads.
- Pause reason and paused-state sync now read page globals through `readPageGlobal()` while preserving the existing `localStorage` fallback.
- `scripts/verify-objective-build.js` now rejects direct `window[BOT_KEY]`, `window.__graspRatBotPauseReason`, and `window.__graspRatBotPaused` reads in the control-login source module.
- The generated production dist remains a single esbuild-produced browser script, and `src/browser-modules/` is not present in the tracked source tree.

This is still an equivalent runtime-boundary cleanup only. It reduces direct page-global coupling in a large browser fragment without changing login, zoom, pause, or strategy behavior.

## 2026-07-03 Follow-up: Phase 2AB Manual Login Page-Global Gate

`bootstrap-0.4.300` continues the same adapter migration across manual login globals:

- Manual-login bypass markers now write and read `__graspRatManualLoginBypassUntil` / `__graspRatManualLoginBypassReason` through `installPageGlobal()` and `readPageGlobal()`.
- `installStartLinuxDoLoginGate()` now reads the existing gate flags and `startLinuxDoLogin` function through the page-global adapter, preserves the raw function through `installPageGlobal()`, and installs the guarded function through the same adapter.
- The manual login execution path in `src/browser/bot-source.js` now reads both raw and guarded `startLinuxDoLogin` through `readPageGlobal()` and invokes the selected function with `pageGlobal` as `this`.
- Static verification now rejects direct `window.__graspRatManualLoginBypass*`, `window.__graspRatBotRawStartLinuxDoLogin`, `window.__graspRatBotStartLinuxDoLoginGateVersion`, and `window.startLinuxDoLogin` usage in the migrated control-login path.

This keeps the same browser global names and login behavior while reducing another runtime-global dependency before true browser module ownership replaces the generated-source internals.

## 2026-07-03 Follow-up: Phase 2AC Page-Native Observer Globals

`bootstrap-0.4.301` migrates two remaining custom page-global reads in the generated runtime:

- `installPageNativeSnapshotObserver()` now stores the shared observer state through `readPageGlobal()` / `installPageGlobal()` instead of `window[key]`.
- The passive observer now reads the page `Response` and `XMLHttpRequest` constructors through `readPageGlobal()` before hooking their prototypes, preserving the existing passive snapshot behavior without direct `window.Response` / `window.XMLHttpRequest` coupling.
- `clashLeaveRescueHook()` now reads the externally installed `__graspRatBotClashLeaveRescue` function through `readPageGlobal()`, preserving the public hook name used by local bootstrap code.
- Static verification checks both direct source and generated dist for the adapter-based observer/hook paths and rejects the old direct `window` access in those migrated functions.

This is another behavior-equivalent page-global boundary cleanup. The bootstrap userscript/extension still install the Clash rescue hook on the page global; only the remote bot's internal read path changes.

## 2026-07-03 Follow-up: Phase 2AD Page-Native Snapshot Source Factory

`bootstrap-0.4.302` extracts the passive page-native snapshot observer source into its own browser source module:

- `src/browser/page-native-snapshot-source.js` now owns `pageNativeSnapshotUrl()`, `pageNativeSnapshotPayload()`, `pageNativeSnapshotError()`, and `installPageNativeSnapshotObserver()` source generation.
- `src/browser/bot-source.js` imports and injects `${pageNativeSnapshotSource()}` instead of carrying that observer block inline.
- Static verification treats the new source factory as canonical, checks its export/raw-source shape, and still verifies the generated single-file runtime contains the same observer behavior.

This is a structural source split only. Passive snapshot behavior, page-global adapter reads, and the generated remote runtime surface remain equivalent.

## 2026-07-03 Follow-up: Phase 2AE Target Whitelist Source Factory

`bootstrap-0.4.303` extracts target whitelist browser runtime source into its own module:

- `src/browser/target-whitelist-source.js` now owns `isWhitelistedTarget()`, `summarizeTargetWhitelistStatus()`, `targetWhitelistFetchUrl()`, `refreshTargetWhitelist()`, and `startTargetWhitelistPolling()` source generation.
- `src/browser/bot-source.js` imports and injects `${targetWhitelistSource()}` instead of carrying those browser functions inline.
- Static verification treats the new source factory as canonical while still checking generated source and dist for username-only matching, cache-busted fetches, configured timeout use, failure behavior that preserves the previous whitelist, and startup/interval polling.

This is another structural source split only. It preserves the existing shared target-whitelist parser, remote target whitelist URL derivation, polling behavior, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AF Network Quality Summary Source Factory

`bootstrap-0.4.304` extracts the network quality status summary function into its own browser source module:

- `src/browser/network-quality-summary-source.js` now owns `summarizeNetworkQuality()` source generation.
- `src/browser/bot-source.js` imports and injects `${networkQualitySummarySource()}` after the network quality sampler/update helpers.
- Static verification checks the new source-factory shape and confirms the generated runtime still exposes the native WebSocket network quality summary used by status, runtime summary, and combat-log diagnostics.

This is a diagnostic/status source split only. It preserves network quality sampling, action acknowledgement tracking, panel display data, combat-log network diagnostics, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AG Network Quality Source Factory

`bootstrap-0.4.305` extracts the network quality sampler and action ACK helper functions into their own browser source module:

- `src/browser/network-quality-source.js` now owns network quality rounding/EMA helpers, state initialization, frame-gap/loss sampling, movement command/ACK tracking, attack shot tracking, and attack damage ACK tracking source generation.
- `src/browser/bot-source.js` imports and injects `${networkQualitySource()}` immediately before `${networkQualitySummarySource()}`.
- Static verification checks the new source-factory shape plus the native frame observer, movement command tracking, shot tracking, and attack damage ACK tracking helpers.

This completes the current network-quality diagnostic source split. It preserves status output, combat-log network diagnostics, movement/shooting ACK tracking, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AH Action Arbitration Source Factory

`bootstrap-0.4.306` extracts target-switch diagnostics and final-action arbitration source generation into a small browser source module:

- `src/browser/action-arbitration-source.js` now owns the raw browser source for action priority helper inlining, target-switch diagnostics wrappers, and final-action arbitration wrappers.
- `src/browser/bot-source.js` imports and injects `${actionArbitrationSource()}` before the remaining coin target/runtime wrappers.
- Static verification checks the new source-factory shape plus target-switch diagnostics, final-action arbitration, action-priority helper inlining, and strategy-core inlining.

This is a source-organization split only. It preserves the existing strategy module cores, target-switch diagnostic events, final action hold behavior, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AI Combat History Source Factory

`bootstrap-0.4.307` extracts attack history, combat engagement state updates, kill history, and drop-matched kill attribution source generation into a dedicated browser source module:

- `src/browser/combat-history-source.js` now owns the raw browser source for `rememberAttack()`, `rememberCombatEngagement()`, kill identity matching, chat kill parsing, live-victim checks, drop-matched kill attribution, and `updateKillHistory()`.
- `src/browser/bot-source.js` imports and injects `${combatHistorySource()}` immediately after `${importantLogSource()}`.
- Static verification checks the new source-factory shape plus attack history, combat engagement, kill history storage, drop-matched kill attribution, and kill-history update helpers.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves combat engagement bookkeeping, important kill logging, chat-confirmed kill safety checks, post-attack drop reward attribution, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AJ Coin Target Runtime Source Factory

`bootstrap-0.4.308` extracts coin target identity, native coin snapshot, incidental pickup, tracked pickup, and coin pickup session accounting source generation into a dedicated browser source module:

- `src/browser/coin-target-runtime-source.js` now owns the raw browser source for `setLastTarget()`, `clearCoinTracking()`, coin target core helper inlining, tracked target reconstruction, native coin snapshot normalization, incidental pickup recording, snapshot coin pruning, and `markCoinCollected()`.
- `src/browser/bot-source.js` imports and injects `${coinTargetRuntimeSource()}` after `${actionArbitrationSource()}`.
- Static verification checks the new source-factory shape plus coin target core inlining, tracked pickup recording, and incidental pickup recording.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves coin target identity, native snapshot memory, incidental pickup session accounting, tracked pickup confirmation, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AK Native Control Source Factory

`bootstrap-0.4.309` extracts native movement/shot dispatch source generation into a dedicated browser source module:

- `src/browser/native-control-source.js` now owns the raw browser source for `wsSend()`, native key synchronization, local/native motion clearing, direct WebSocket velocity messages/repeats, action velocity pulses, pointer aiming, direct/fallback native shooting, and combat shot attempt recording.
- `src/browser/bot-source.js` imports and injects `${nativeControlSource()}` after the network-quality/combat-history runtime fragments.
- Static verification checks the new source-factory shape plus direct velocity sending, repeat scheduling, safe stop, native shoot, and shoot cadence wrapper presence.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves movement transport, stop semantics, shot cadence, shot logging, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AL Coin Motion Runtime Source Factory

`bootstrap-0.4.310` extracts coin motion runtime wrapper source generation into a dedicated browser source module:

- `src/browser/coin-motion-runtime-source.js` now owns the raw browser source for `directionTo()`, coin motion strategy core inlining, `coinMotionCoreOptions()`, pickup failure/slow-attempt counters, approach-lock updates, `coinDirectionTo()`, and `coinMotionMeta()`.
- `src/browser/bot-source.js` imports and injects `${coinMotionRuntimeSource()}` after `${nativeControlSource()}`.
- Static verification checks the new source-factory shape plus coin motion strategy module import, core helper inlining, lock-update wrapper, and wrapper calls into `coinDirectionToCore()` / `coinMotionMetaCore()`.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves coin movement direction, pickup pulse metadata, approach-lock behavior, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AM Return Block Source Factory

`bootstrap-0.4.311` extracts return-block and active-threat helper source generation into a dedicated browser source module:

- `src/browser/return-block-source.js` now owns the raw browser source for flee direction helpers, return-block radius/resume calculations, lateral scan direction/action construction, return-block pressure tracking, and `blockThreatReturnAction()`.
- `src/browser/bot-source.js` imports and injects `${returnBlockSource()}` after `${coinMotionRuntimeSource()}`.
- Static verification checks the new source-factory shape plus generated runtime presence for `blockThreatReturnAction`, `active-threat-return-block`, and `return-block-lateral-scan`.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves active-threat return-block behavior, return-block lateral scan behavior, flee-lock semantics, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AN Entity Activity Source Factory

`bootstrap-0.4.312` extracts foundational entity activity helper source generation into a dedicated browser source module:

- `src/browser/entity-activity-source.js` now owns the raw browser source for `hypot`, `now()`, `dist()`, `speed()`, truthy flag parsing, invulnerability aliases, stamina window helpers, active/firing/moving detection, recent-activity cooldown checks, idle-invulnerable detection, and AFK profit target classification.
- `src/browser/bot-source.js` imports and injects `${entityActivitySource()}` immediately before `${targetWhitelistSource()}`.
- Static verification checks the new source-factory shape plus generated runtime presence for the clock helper, recent-activity helper, and AFK profit helper.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves entity activity classification, stamina helper behavior, AFK target classification, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AO Stamina Runtime Source Factory

`bootstrap-0.4.313` extracts HP and stamina runtime helper source generation into a dedicated browser source module:

- `src/browser/stamina-runtime-source.js` now owns the raw browser source for HP helpers, active-threat decoration, recovery/conserve predicates, `summarizeStamina()`, daily stamina reset calculations, stamina reset hold construction, startup zero-stamina deferral, and stale offline stamina contradiction checks.
- `src/browser/bot-source.js` imports and injects `${staminaRuntimeSource()}` immediately after `${targetWhitelistSource()}`.
- Static verification checks the new source-factory shape plus generated runtime presence for `summarizeStamina()`, `staminaResetHoldUntil()`, and `staleOfflineStaminaHoldContradicted()`.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves HP summaries, stamina exhaustion/hold behavior, startup stamina deferral, stale offline hold cleanup, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AV Auto-login Source Factory

`bootstrap-0.4.320` extracts automatic/manual login source generation into a dedicated browser source module:

- `src/browser/auto-login-source.js` now owns the raw browser source for `maybeStartAutoLogin()` and `forceLoginNow()`.
- `src/browser/bot-source.js` imports and injects `${autoLoginSource()}` immediately after `${leaveCommandSource()}`, preserving the generated runtime order before the leave wrapper functions.
- Static verification checks the new source-factory shape, injection point, page-global login adapter anchors, live-session takeover bypass handling, and generated runtime presence for the auto/manual login functions.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves automatic relogin gating, manual login bypass behavior, exit/important-log flush blocking, login-point snapshot gating, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AW Leave Flow Source Factory

`bootstrap-0.4.321` extracts high-level leave flow source generation into a dedicated browser source module:

- `src/browser/leave-flow-source.js` now owns the raw browser source for `leaveOffline()`, `leaveForInjury()`, `leaveForPursuit()`, `leaveForCombat()`, and `leaveDuringEnemyHold()`.
- `src/browser/bot-source.js` imports and injects `${leaveFlowSource()}` immediately after `${autoLoginSource()}`, preserving the generated runtime order before native state helpers.
- Static verification checks the new source-factory shape, injection point, all five leave wrapper functions, pending-exit duplicate-leave guards, and generated runtime behavior anchors for cooldown summaries and pending-exit skip paths.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves offline/injury/pursuit/combat leave cooldown handling, pending-exit duplicate suppression, exit audit starts, unsafe/stamina relogin suppression, pending-exit recording, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AX Entity Refresh Source Factory

`bootstrap-0.4.322` extracts entity refresh and activity-memory source generation into a dedicated browser source module:

- `src/browser/entity-refresh-source.js` now owns the raw browser source for `markRecentMovement()` and `refreshGlobalState()`.
- `src/browser/bot-source.js` imports and injects `${entityRefreshSource()}` immediately after `${combatHistorySource()}`, preserving the generated runtime order before native control helpers.
- Static verification checks the new source-factory shape, injection point, recent movement marker, global refresh helper, passive active-API-disabled diagnostic text, and generated runtime behavior anchors for passive refresh diagnostics.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves recent movement/activity bookkeeping, seen-entity TTL cleanup, passive-only global refresh behavior, active game API disabled diagnostics, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AY Classify Source Factory

`bootstrap-0.4.323` extracts entity/coin/combat classification source generation into a dedicated browser source module:

- `src/browser/classify-source.js` now owns the raw browser source for `classify(self)`.
- `src/browser/bot-source.js` imports and injects `${classifySource()}` between `${returnBlockSource()}` and `${offlineSafetySource()}`, preserving the generated runtime order.
- Static verification checks the new source-factory shape, injection point, recent movement marking, combat target classification, combat dodge-only classification, and snapshot coin classification anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves realtime/native entity merging, global snapshot fallback filtering, coin bucket construction, active/inactive target classification, combat target lists, snapshot coin filtering, bullet collection, and the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2AZ Coin Safety Source Factory

`bootstrap-0.4.324` extracts coin safety, coin diagnostics, and coin picker source generation into a dedicated browser source module:

- `src/browser/coin-safety-source.js` now owns the raw browser source for coin threat radii, invulnerable heading blocks, safe coin candidate filtering, coin diagnostic helper inlining, stamina-affordability diagnostics, realtime local coin picking, field migration blocking, field coin picking, and distant coin picking.
- `src/browser/bot-source.js` imports and injects `${coinSafetySource()}` immediately after `${offlineSafetySource()}`, preserving the generated runtime order before high-value coin priority helpers.
- Static verification checks the new source-factory shape, injection point, coin diagnostics strategy helper inlining, threat radius helper, safe coin candidate filter, realtime local coin picker, field coin picker, and distant coin picker anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves active threat coin blocking, invulnerable coin heading avoidance, ignored-coin cleanup, near-coin diagnostic collection, coin stamina diagnostics, realtime-only local coin fallback, field migration nearby-coin suppression, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BA Target Selection Source Factory

`bootstrap-0.4.325` extracts high-value coin priority, combat target selection, engaged target retention, and opportunistic shot source generation into a dedicated browser source module:

- `src/browser/target-selection-source.js` now owns the raw browser source for high-value coin priority thresholds, visible high-value coin picking, low-value active combat classification, proactive active-combat stamina gating, defensive/profit combat target selection, engaged combat target re-selection, defensive override checks, and opportunistic AFK drop shot wrapping.
- `src/browser/bot-source.js` imports and injects `${targetSelectionSource()}` immediately after `${coinSafetySource()}`, preserving the generated runtime order before combat movement helpers.
- Static verification checks the new source-factory shape, injection point, high-value coin helper, high-value visible coin picker, defensive combat classifier, combat target picker, engaged combat picker, defensive override helper, opportunistic shot attachment, and opportunistic shot wait builder anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves high-value coin priority behavior, low-value active combat threat evidence rules, proactive active-combat stamina gating, incoming-bullet defensive target selection, engaged target grace handling, retreat-ignore cleanup, and opportunistic AFK shot metadata.

## 2026-07-03 Follow-up: Phase 2BB Combat Movement Source Factory

`bootstrap-0.4.326` extracts combat movement, bullet-pressure, spacing, and dodge action source generation into a dedicated browser source module:

- `src/browser/combat-movement-source.js` now owns the raw browser source for combat movement velocity conversion, incoming bullet threat classification, threat-field scoring, strafe locking, tangent bullet dodge movement, spacing vectors, low-HP/pressure disadvantage states, close/reengage/finish-pressure movement states, passive-runner handling, move merging, pressure threat construction, and out-of-range dodge action construction.
- `src/browser/bot-source.js` imports and injects `${combatMovementSource()}` immediately after `${targetSelectionSource()}`, preserving the generated runtime order before combat aim helpers.
- Static verification checks the new source-factory shape, injection point, movement velocity helper, bullet threat classifier, threat-field scorer, tangent dodge helper, spacing vector helper, pressure disadvantage helper, out-of-range reengage helper, passive runner helper, and out-of-range dodge action anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves incoming-bullet dodge scoring, combat strafe lock/carry behavior, safe-close override checks, HP/pressure stop-loss state construction, passive-runner close behavior, out-of-range dodge action metadata, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BC Combat Aim Source Factory

`bootstrap-0.4.327` extracts combat aim motion, opponent profiling, and trade-estimate source generation into a dedicated browser source module:

- `src/browser/combat-aim-source.js` now owns the raw browser source for aim jitter limits, target motion scaling, combat motion samples, opponent motion profiling, and combat trade estimation.
- `src/browser/bot-source.js` imports and injects `${combatAimSource()}` immediately after `${combatMovementSource()}`, preserving the generated runtime order before opportunity stamina helpers.
- Static verification checks the new source-factory shape, injection point, aim jitter helper, motion-scale helper, motion-history helper, opponent-profile helper, and trade-estimate helper anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves low-motion aim jitter scaling, combat motion history windows, short-window opponent motion profiling, exchange-rate disadvantage estimation, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BD Combat Fire Source Factory

`bootstrap-0.4.328` extracts combat shooting discipline and aim-target source generation into a dedicated browser source module:

- `src/browser/combat-fire-source.js` now owns the raw browser source for `combatShootingPlan()`, no-damage aim widening helpers, movement aim mode classification, intercept solving, live aim target refresh, dynamic aim strategy selection, and `combatAimTarget()`.
- `src/browser/bot-source.js` imports and injects `${combatFireSource()}` immediately after `${combatAimSource()}`, preserving the generated runtime order before `combatLeaveCoverAction()`.
- Static verification checks the new source-factory shape, injection point, shooting plan helper, no-damage aim helper, movement aim mode helper, intercept solver, live aim helper, dynamic aim strategy helper, and aim target helper anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves stamina-aware fire discipline, opponent-probe burst timing, low-confidence throttling, live/native aim refresh, precision/intercept aim modes, aim locking, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BE Combat State Source Factory

`bootstrap-0.4.329` extracts combat state, trend, and combat-loop gap source generation into a dedicated browser source module:

- `src/browser/combat-state-source.js` now owns the raw browser source for combat target identity, retreat-ignore state, combat disadvantage observation state, damage/no-damage leave states, retreating target state, combat trend state, sampling-outage combat gating, combat tick-gap offline state, tick-reentry gap handling, and dynamic native tick interval selection.
- `src/browser/bot-source.js` imports and injects `${combatStateSource()}` immediately before `${combatFireSource()}`, preserving the generated runtime order.
- Static verification checks the new source-factory shape, injection point, combat target id helper, disadvantage observation helper, trend state helper, sampling outage helper, combat tick-gap helper, tick-reentry handler, and native tick interval helper anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves combat retreat-ignore state, HP/trade disadvantage confirmation, no-damage state construction, combat trend fire windows, combat-only sampling outage gating, combat tick-gap offline handling, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BF Combat Action Source Factory

`bootstrap-0.4.330` extracts combat action construction source generation into a dedicated browser source module:

- `src/browser/combat-action-source.js` now owns the raw browser source for `buildCombatAction()`, including combat leave/cover branches, HP and pressure disadvantage exits, retreating/disengage handling, out-of-range reengage/hold actions, pressure-close movement composition, shooting plan wiring, aim metadata logging, and combat-state frame metadata.
- `src/browser/bot-source.js` imports and injects `${combatActionSource()}` immediately after `${combatFireSource()}`, preserving the generated runtime order before snapshot coin helpers.
- Static verification checks the new source-factory shape, injection point, combat action builder, leave-cover wiring, out-of-range dodge wiring, combat trend wiring, shooting plan wiring, and combat-state logging anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves combat action arbitration inputs, leave cover fallback behavior, HP/trade/pressure exits, finish-pressure/reengage decisions, movement/aim/shoot metadata, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BG Post-Attack Source Factory

`bootstrap-0.4.334` extracts post-attack drop source generation into a dedicated browser source module:

- `src/browser/post-attack-source.js` now owns the raw browser source for attack-history target matching, target resolution timing, visible post-attack drop coin matching, post-attack wait target selection, and wait action construction.
- `src/browser/bot-source.js` imports and injects `${postAttackSource()}` at the original boundary before `enemyOpportunityCandidates()`, preserving the generated runtime order after profitable combat target selection.
- Static verification checks the new source-factory shape, injection point, drop coin picker, wait target picker, wait action builder, post-attack strategy import, and core inlining anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves post-attack visible drop attribution, recovery drop override thresholds, killed-target wait behavior, post-attack strategy-core wrapper calls, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BH Opportunity Actions Source Factory

`bootstrap-0.4.335` extracts opportunity action source generation into a dedicated browser source module:

- `src/browser/opportunity-actions-source.js` now owns the raw browser source for enemy opportunity candidate filtering, coin action construction, and enemy action construction.
- `src/browser/bot-source.js` imports and injects `${opportunityActionsSource()}` immediately after `${postAttackSource()}`, preserving the generated runtime order before opportunity choice strategy helpers.
- Static verification checks the new source-factory shape, injection point, enemy candidate helper, coin action builder, and enemy action builder anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves AFK/profitable enemy action construction, coin route action metadata wiring, opportunity action score/stamina metadata, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BI Opportunity Route Source Factory

`bootstrap-0.4.336` extracts coin-route opportunity source generation into a dedicated browser source module:

- `src/browser/opportunity-route-source.js` now owns the raw browser source for coin-route strategy core inlining, route core options, route leg/summary wrappers, closer-first and held-route guards, held coin choice helpers, and route opportunity picking.
- `src/browser/bot-source.js` imports and injects `${opportunityRouteSource()}` at the original boundary before `opportunityCandidateCoreOptions()`, preserving generated runtime order before opportunity candidate construction wrappers.
- Static verification checks the new source-factory shape, injection point, coin-route strategy import, route picker core inlining, route action metadata core inlining, core options wrapper, and held-route helper anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves bounded native visible coin route planning, held route stabilization, same-first route metadata, coin-route action metadata, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BJ Opportunity Candidate Source Factory

`bootstrap-0.4.337` extracts opportunity candidate source generation into a dedicated browser source module:

- `src/browser/opportunity-candidate-source.js` now owns the raw browser source for opportunity candidate strategy core inlining, route source injection, opportunity candidate core options, unique visible route coin wrapper, best coin opportunity score wrapper, and profitable combat target comparison.
- `src/browser/bot-source.js` imports and injects `${opportunityCandidateSource()}` at the original boundary before opportunity choice helpers, preserving generated runtime order after the opportunity route helpers.
- Static verification checks the new source-factory shape, injection point, route source injection, opportunity candidate strategy import, candidate core inlining, core options wrapper, and profitable combat target wrapper anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves visible coin de-duplication, route metadata merge, coin/enemy candidate construction, route score comparison, profitable combat target selection, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BK Opportunity Choice Source Factory

`bootstrap-0.4.338` extracts opportunity choice source generation into a dedicated browser source module:

- `src/browser/opportunity-choice-source.js` now owns the raw browser source for opportunity choice strategy core inlining, runtime choice options, switch-lock wrappers, same-coin matching, missing-held visible-source checks, missing-visible cleanup, missing-held opportunity reconstruction, choice persistence, high-value hold checks, and stable choice selection.
- `src/browser/bot-source.js` imports and injects `${opportunityChoiceSource()}` at the original boundary after opportunity action source generation and before `pickBestOpportunity()`, preserving generated runtime order after candidate/action construction helpers.
- Static verification checks the new source-factory shape, injection point, opportunity choice strategy import, stable picker core inlining, persistence core inlining, missing-held core inlining, options wrapper, and missing-held wrapper anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves choice hold windows, oscillation locks, visible-missing cleanup, missing-held route metadata, stable opportunity selection, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BL Coin Progress Runtime Source Factory

`bootstrap-0.4.339` extracts coin progress runtime source generation into a dedicated browser source module:

- `src/browser/coin-progress-runtime-source.js` now owns the raw browser source for coin-progress strategy core inlining, runtime options, failure ignore state writes, stale-coin escape state writes, ignored-coin cleanup, and `trackCoinProgress()`.
- `src/browser/bot-source.js` imports and injects `${coinProgressRuntimeSource()}` at the original boundary before action arbitration source generation, preserving generated runtime order before final action arbitration and coin target runtime helpers.
- Static verification checks the new source-factory shape, injection point, coin-progress strategy import, core inlining, `trackCoinProgress()` wrapper, and retained runtime state-write anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves stale coin ignore/backoff, no-progress cleanup, approach-lock clearing, opportunity-choice clearing, stale-coin escape patrol actions, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BM Opportunity Pick Source Factory

`bootstrap-0.4.340` extracts best opportunity picker source generation into a dedicated browser source module:

- `src/browser/opportunity-pick-source.js` now owns the raw browser source for `pickBestOpportunity()`, including enemy candidate collection, visible coin-route selection, opportunity candidate core construction, coin/enemy action closures, missing-held insertion, stable choice selection, and choice persistence.
- `src/browser/bot-source.js` imports and injects `${opportunityPickSource()}` immediately after `${opportunityChoiceSource()}`, preserving generated runtime order before patrol and action selection helpers.
- Static verification checks the new source-factory shape, injection point, `pickBestOpportunity()` wrapper, route opportunity selection, and candidate core call anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves visible opportunity selection, route-aware opportunity scoring, missing-held insertion, stable choice selection, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BN Patrol Source Factory

`bootstrap-0.4.341` extracts patrol direction source generation into a dedicated browser source module:

- `src/browser/patrol-source.js` now owns the raw browser source for `patrolDirection()`, including distant visible-coin scan movement, nearby-human safe-spacing vectors, active-threat spacing vectors, patrol-heading reset, and wait-for-visible-coin-refresh fallback.
- `src/browser/bot-source.js` imports and injects `${patrolSource()}` immediately after `${opportunityPickSource()}`, preserving generated runtime order before opportunity-choice clearing and coin progress runtime helpers.
- Static verification checks the new source-factory shape, injection point, `patrolDirection()` wrapper, distant-coin scan branch, and safe-spacing branch anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves patrol movement selection, safe-spacing behavior, patrol-heading reset behavior, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BO Opportunity Clear Source Factory

`bootstrap-0.4.342` extracts opportunity choice clearing source generation into a dedicated browser source module:

- `src/browser/opportunity-clear-source.js` now owns the raw browser source for `clearOpportunityChoiceFor()`, including type checks, optional full clearing, same-id clearing, and opportunity switch-lock reset.
- `src/browser/bot-source.js` imports and injects `${opportunityClearSource()}` immediately after `${patrolSource()}`, preserving generated runtime order before coin progress runtime helpers.
- Static verification checks the new source-factory shape, injection point, `clearOpportunityChoiceFor()` wrapper, choice clearing, and switch-lock reset anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves opportunity choice cleanup behavior and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BP Exit Motion Source Factory

`bootstrap-0.4.343` extracts exit motion stop and post-exit target cleanup source generation into a dedicated browser source module:

- `src/browser/exit-motion-source.js` now owns the raw browser source for `exitMotionStopLockRemainingMs()`, `exitMotionStopActive()`, `postExitDecisionWithoutTarget()`, and `clearPostExitTargetState()`.
- `src/browser/bot-source.js` imports and injects `${exitMotionSource()}` immediately after the `attackWorthTaking()` wrapper, preserving generated runtime order before target overlay source generation.
- Static verification checks the new source-factory shape, injection point, motion stop lock helper, post-exit decision helper, target cleanup helper, and overlay cleanup anchor.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves exit-motion wait decoration, post-exit target/choice cleanup, overlay cleanup, panel refresh behavior, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BQ Persistent Last-Self Source Factory

`bootstrap-0.4.344` extracts persistent last-self source generation into a dedicated browser source module:

- `src/browser/persistent-last-self-source.js` now owns the raw browser source for `readPersistentLastSelfState()` and `writePersistentLastSelfState()`.
- `src/browser/bot-source.js` imports and injects `${persistentLastSelfSource()}` immediately after target whitelist state initialization, preserving generated runtime order before exit-state persistence helpers.
- Static verification checks the new source-factory shape, injection point, read helper, write helper, and `LAST_SELF_STATE_KEY` storage anchor.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves persistent last-self localStorage read/write behavior, max-age handling, payload shape, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BR Persistent Exit Source Factory

`bootstrap-0.4.345` extracts persistent exit source generation into a dedicated browser source module:

- `src/browser/persistent-exit-source.js` now owns the raw browser source for `readPersistentExitState()` and `writePersistentExitState()`.
- `src/browser/bot-source.js` imports and injects `${persistentExitSource()}` immediately after `${persistentLastSelfSource()}`, preserving generated runtime order before persistent exit clear/pending-exit helpers.
- Static verification checks the new source-factory shape, injection point, read helper, write helper, and `refreshExitDetail` anchor.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves persistent exit localStorage read/write behavior, expired relogin hold cleanup, finalized display updates, payload shape, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BS Persistent Clear Source Factory

`bootstrap-0.4.346` extracts persistent clear source generation into a dedicated browser source module:

- `src/browser/persistent-clear-source.js` now owns the raw browser source for `clearPersistentExitState()` and `clearPersistentPendingExitState()`.
- `src/browser/bot-source.js` imports and injects `${persistentClearSource()}` immediately after `${persistentExitSource()}`, preserving generated runtime order before pending-exit normalization helpers.
- Static verification checks the new source-factory shape, injection point, exit clear helper, pending-exit clear helper, and `PENDING_EXIT_STATE_KEY` anchor.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves persistent exit hold clearing, persisted pending-exit clearing, existing call sites, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BT Pending-Exit Persistence Source Factory

`bootstrap-0.4.347` extracts pending-exit persistence source generation into a dedicated browser source module:

- `src/browser/pending-exit-persistence-source.js` now owns the raw browser source for `normalizePendingExitReloadConfirmation()`, `normalizePendingExitStateForStorage()`, `readPersistedPendingExitState()`, `writePersistentPendingExitState()`, and `chooseInitialPendingExitState()`.
- `src/browser/bot-source.js` imports and injects `${pendingExitPersistenceSource()}` immediately after `${persistentClearSource()}`, preserving generated runtime order before exit-detail refresh helpers.
- Static verification checks the new source-factory shape, injection point, reload normalizer, storage normalizer, reader, writer, initial-state chooser, and `PENDING_EXIT_STATE_KEY` anchor.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves pending-exit storage schema, reload-confirmation restoration, max-age cleanup, localStorage read/write behavior, initial memory-vs-storage selection, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BU Refresh Exit Detail Source Factory

`bootstrap-0.4.348` extracts exit-detail refresh source generation into a dedicated browser source module:

- `src/browser/refresh-exit-detail-source.js` now owns the raw browser source for `refreshExitDetail()`.
- `src/browser/bot-source.js` imports and injects `${refreshExitDetailSource()}` immediately after `${pendingExitPersistenceSource()}`, preserving generated runtime order before restored coin-failure helpers.
- Static verification checks the new source-factory shape, injection point, refresh helper, relogin hold remaining-time update, stamina-budget summary branch, and display finalization anchor.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves relogin hold remaining-time refresh, stamina-budget/stamina-exhausted offline summary refresh, final leave display reason normalization, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BV Restored Coin Failures Source Factory

`bootstrap-0.4.349` extracts restored coin-failure source generation into a dedicated browser source module:

- `src/browser/restored-coin-failures-source.js` now owns the raw browser source for `restoredCoinFailures()`.
- `src/browser/bot-source.js` imports and injects `${restoredCoinFailuresSource()}` immediately after `${refreshExitDetailSource()}`, preserving generated runtime order before restored exit-state initialization.
- Static verification checks the new source-factory shape, injection point, restore helper, preserved failure reads, severe ignore restoration, and hard ignore restoration anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves preserved coin-failure replay, near/close single-failure cleanup, stale failure handling, hard/severe ignore-window restoration, startup `ignoredCoins` / `coinFailures` inputs, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BW Login Snapshot Gate Source Factory

`bootstrap-0.4.350` extracts login snapshot gate source generation into a dedicated browser source module:

- `src/browser/login-snapshot-gate-source.js` now owns the raw browser source for `loginSnapshotSuccessRequired()` and `normalizeLoginSnapshotGateState()`.
- `src/browser/bot-source.js` imports and injects `${loginSnapshotGateSource()}` after restored exit state initialization, preserving generated runtime order before runtime diagnostics helpers.
- Static verification checks the new source-factory shape, injection point, required-count helper, state normalizer, last-sample timestamp, and reset reason anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves the disabled snapshot streak requirement, login snapshot gate state rounding/defaulting, last-sample timestamp preservation, reset metadata preservation, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BX Runtime Diagnostics Source Factory

`bootstrap-0.4.351` extracts runtime diagnostics source generation into a dedicated browser source module:

- `src/browser/runtime-diagnostics-source.js` now owns the raw browser source for `recordRuntimeDiagnostics()`.
- `src/browser/bot-source.js` imports and injects `${runtimeDiagnosticsSource()}` immediately after `${loginSnapshotGateSource()}`, preserving generated runtime order before the `bot` state object.
- Static verification checks the new source-factory shape, injection point, diagnostics recorder helper, `bot.runtimeDiagnostics` update, `Object.assign()` merge, and error-swallowing anchors.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves guarded `bot.runtimeDiagnostics` initialization, diagnostic value merging, swallowed diagnostics write errors, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BY Tick Safety Source Factory

`bootstrap-0.4.352` extracts tick/callback safety source generation into a dedicated browser source module:

- `src/browser/tick-safety-source.js` now owns the raw browser source for `recordUnhandledTickError()`, `runTickSafely()`, and `runCallbackSafely()`.
- `src/browser/bot-source.js` imports and injects `${tickSafetySource()}` immediately after `${combatLogSource({ combatLogExitSummaryFromDecision })}`, preserving generated runtime order before control-login helpers.
- Static verification checks the new source-factory shape, injection point, unhandled tick recorder, console logging, tick safety wrapper, runtime diagnostics recording, callback safety wrapper, and async callback error capture.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves bounded `bot.errors` recording, console error logging, runtime tick diagnostics, tick promise error capture, async callback rejection capture, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2BZ Attack-Worth Source Factory

`bootstrap-0.4.353` extracts attack-worth source generation into a dedicated browser source module:

- `src/browser/attack-worth-source.js` now owns the raw browser source for `attackWorthTaking()`.
- `src/browser/bot-source.js` imports and injects `${attackWorthSource()}` immediately after `${staminaRuntimeSource()}`, preserving generated runtime order before exit-motion helpers and before target-selection/opportunity-action consumers.
- Static verification checks the new source-factory shape, injection point, attack-worth wrapper, whitelist guard, AFK profit target handling, and reward-ratio guard.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves target whitelist blocking, AFK profit target drop threshold handling, own-drop reward ratio comparison, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CA Array-Count Source Factory

`bootstrap-0.4.354` extracts array-count source generation into a dedicated browser source module:

- `src/browser/array-count-source.js` now owns the raw browser source for `arrayCount()`.
- `src/browser/bot-source.js` imports and injects `${arrayCountSource()}` immediately after shared `safeStringify()` injection, preserving generated runtime order before shared clone/log-id helpers and combat-log helpers.
- Static verification checks the new source-factory shape, injection point, array-count helper, and array-length fallback.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It preserves the `Array.isArray(value) ? value.length : 0` fallback used by status, diagnostics, and runtime summaries, and final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CB Choose-Action Source Factory

`bootstrap-0.4.355` extracts the top-level `chooseAction(self)` browser decision source into a dedicated browser source module:

- `src/browser/choose-action-source.js` now owns the raw browser source for `chooseAction(self)`.
- `src/browser/bot-source.js` imports and injects `${chooseActionSource()}` after coin target runtime helpers and before `tick()`.
- Static verification checks the new source-factory shape, injection point, and anchors for coin diagnostics, high-value visible coin priority, post-attack drop coin handling, stamina-budget exits, opportunity selection, and visible-coin wait fallback.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It isolates a 451-line decision function and reduces `src/browser/bot-source.js` to 1720 lines while preserving the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CC Tick Source Factory

`bootstrap-0.4.356` extracts the main `tick(source = 'timer')` browser runtime loop into a dedicated browser source module:

- `src/browser/tick-source.js` now owns the raw browser source for the 885-line tick loop.
- `src/browser/bot-source.js` imports and injects `${tickSource()}` after `${chooseActionSource()}` and before startup install/restore flow.
- Static verification checks the new source-factory shape, injection point, and anchors for pending-exit handling, login/no-self handling, offline leave handling, action selection, coin progress tracking, final action arbitration, important combat tick logging, and combat-log tick logging.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/bot-source.js` to 843 lines while preserving the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CD Startup Source Factory

`bootstrap-0.4.357` extracts the startup install/restore browser runtime tail into a dedicated browser source module:

- `src/browser/startup-source.js` now owns the raw browser source for persisted-log restore, page/global installation, startup refresh, startup tick, timer setup, and startup-finalize error handling.
- `src/browser/bot-source.js` imports and injects `${startupSource()}` after `${tickSource()}` and before the IIFE close.
- Static verification checks the new source-factory shape, injection point, and anchors for exit-audit restore, combat-log pending restore, important-log restore, native login gate installation, bot page-global installation, previous-bot shutdown, page-native observer installation, target whitelist polling, startup tick, and timer tick safety.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/bot-source.js` to 773 lines while preserving the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CE Bot Object Source Factory

`bootstrap-0.4.358` extracts the runtime `bot` object and status/control API source into a dedicated browser source module:

- `src/browser/bot-object-source.js` now owns the raw browser source for `const bot = { ... }`, including runtime state, stop/pause control methods, status reporting, and summary helpers.
- `src/browser/bot-source.js` imports and injects `${botObjectSource()}` at the original boundary after runtime diagnostics helpers.
- Static verification checks the new source-factory shape, injection point, and anchors for pending-exit state, combat/important log state, post-login zoom state, `stop()`, `setPaused()`, `status()`, network-quality summary reporting, and pending-exit status summaries.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/bot-source.js` to 252 lines while preserving the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CF Runtime Bootstrap Source Factory

`bootstrap-0.4.359` extracts the runtime bootstrap prelude into a dedicated browser source module:

- `src/browser/runtime-bootstrap-source.js` now owns the raw browser source for page-global helper injection, runtime config merging, storage keys, shared helper inlining, previous-bot preservation, runtime default construction, and target whitelist initial state.
- `src/browser/bot-source.js` imports and injects `${runtimeBootstrapSource(config)}` immediately after the IIFE open.
- Static verification checks the new source-factory shape, injection point, and anchors for page-global adapter injection, runtime config reads, previous bot reads, preserved-state/defaults/target-whitelist helper imports, runtime defaults inlining, target whitelist helper inlining, and generated runtime helper presence.
- A fixed-version `--print-source` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/bot-source.js` to 159 lines while preserving the final single-file generated runtime.

## 2026-07-03 Follow-up: Phase 2CG Runtime Assembly Boundary

`bootstrap-0.4.360` renames the remaining browser runtime assembly boundary and removes the legacy `bot-source.js` file:

- `src/browser/runtime-assembly-source.js` now owns the remaining source-fragment assembly function, renamed to `browserRuntimeAssemblySource(config)`.
- `src/browser/runtime-source.js` imports `browserRuntimeAssemblySource()` directly instead of importing the legacy `browserBotSource()` from `bot-source.js`.
- `src/browser/bot-source.js` is removed; static verification checks that it no longer exists and that the runtime boundary uses `runtime-assembly-source.js`.
- A fixed-version `--print-source` baseline matched byte-for-byte after the rename, proving the generated browser source is unchanged by the boundary rename.

This is a source-organization split only. It keeps the remaining 159-line assembly layer but gives it an accurate runtime-assembly name and removes the old bot-source boundary.

## 2026-07-03 Follow-up: Phase 2CH Runtime Assembly Fragment Registry

`bootstrap-0.4.361` converts the remaining browser runtime assembly function from one large template-literal return into an explicit fragment registry:

- `src/browser/runtime-assembly-source.js` now builds a `fragments` array with string gaps, source-factory references, and helper-bound closures for fragments that need runtime config or imported display/log helpers.
- `renderRuntimeFragments(fragments)` centralizes assembly rendering by invoking function fragments and joining all rendered parts without separators.
- Static verification checks the registry renderer, the explicit fragment list, the runtime-bootstrap closure, all source-factory names, and the helper-bound status-panel, combat-log, and control-login closures.
- A fixed-version `--print-source --bot-version bootstrap-0.4.361` baseline matched byte-for-byte after the conversion, proving the generated browser source is unchanged by the registry migration.

This is a source-organization split only. It does not reduce line count; it makes the remaining assembly order explicit so later slices can replace entries with true browser-module ownership under a smaller diff.

## 2026-07-03 Follow-up: Phase 2CI Restored Runtime State Source Factory

`bootstrap-0.4.362` extracts the cold-start restored runtime state initialization into a dedicated browser source module:

- `src/browser/restored-runtime-state-source.js` now owns restored coin failures binding, enemy/offline leave-state reads, persisted pending-exit restoration, and initial pending-exit selection.
- `src/browser/runtime-assembly-source.js` imports and lists `restoredRuntimeStateSource` between `restoredCoinFailuresSource` and `loginSnapshotGateSource`.
- Static verification checks the source-factory shape, module export, registry entry, source-runtime aggregation, restored failure binding, pending-exit restoration with reload marker, and initial pending-exit selection anchor.
- A fixed-version `--print-source --bot-version bootstrap-0.4.362` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/runtime-assembly-source.js` to 263 lines and keeps the new restored runtime state source factory to 14 lines.

## 2026-07-03 Follow-up: Phase 2CJ Runtime Utility Source Factory

`bootstrap-0.4.363` extracts shared runtime utility source injection into a dedicated browser source module:

- `src/browser/runtime-utils-source.js` now owns browser-source injection for `safeStringify()`, `safeJsonClone()`, and `sanitizeCombatLogIdPart()` from `src/shared/runtime-utils.js`.
- `src/browser/runtime-assembly-source.js` imports `runtimeUtilityPreludeSource` and `runtimeUtilityCloneSource`, keeping the original generated order around `arrayCountSource()`.
- Static verification checks the new source-factory shapes, module exports, shared helper injection anchors, registry entries, and generated runtime helper presence.
- A fixed-version `--print-source --bot-version bootstrap-0.4.363` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/runtime-assembly-source.js` to 253 lines and keeps the new runtime utility source factory to 29 lines.

## 2026-07-03 Follow-up: Phase 2CK Status Panel Runtime Source Factory

`bootstrap-0.4.364` extracts the helper-bound status panel runtime fragment into a dedicated browser source module:

- `src/browser/status-panel-runtime-source.js` now owns display helper imports and calls `statusPanelSource({ escapeHtml, formatDistance, formatDurationMs, actorLabel, hpDisplay })`.
- `src/browser/runtime-assembly-source.js` imports and lists `statusPanelRuntimeSource`, so the assembly layer no longer imports `../shared/display-format` directly.
- Static verification checks the wrapper source-factory shape, display-helper import, status-panel source import, helper binding call, registry entry, and generated runtime helper presence.
- A fixed-version `--print-source --bot-version bootstrap-0.4.364` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/runtime-assembly-source.js` to 246 lines and keeps the new status panel runtime source factory to 16 lines.

## 2026-07-03 Follow-up: Phase 2CL Combat Log Runtime Source Factory

`bootstrap-0.4.365` extracts the helper-bound combat-log runtime fragment into a dedicated browser source module:

- `src/browser/combat-log-runtime-source.js` now owns the shared exit-summary import and calls `combatLogSource({ combatLogExitSummaryFromDecision })`.
- `src/browser/runtime-assembly-source.js` imports and lists `combatLogRuntimeSource`, so the assembly layer no longer imports `combatLogExitSummaryFromDecision` directly.
- Static verification checks the wrapper source-factory shape, exit-summary import, combat-log source import, helper binding call, registry entry, and generated runtime helper presence.
- A fixed-version `--print-source --bot-version bootstrap-0.4.365` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/runtime-assembly-source.js` to 243 lines and keeps the new combat-log runtime source factory to 10 lines.

## 2026-07-03 Follow-up: Phase 2CM Control Login Runtime Source Factory

`bootstrap-0.4.366` extracts the helper-bound control-login runtime fragment into a dedicated browser source module:

- `src/browser/control-login-runtime-source.js` now owns the shared exit-summary import and calls `controlLoginSource({ staminaExhaustedWindowLabel })`.
- `src/browser/runtime-assembly-source.js` imports and lists `controlLoginRuntimeSource`, so the assembly layer no longer imports `staminaExhaustedWindowLabel` directly.
- Static verification checks the wrapper source-factory shape, exit-summary import, control-login source import, helper binding call, registry entry, and generated runtime helper presence.
- A fixed-version `--print-source --bot-version bootstrap-0.4.366` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/runtime-assembly-source.js` to 242 lines and keeps the new control-login runtime source factory to 10 lines.

## 2026-07-04 Follow-up: Phase 2CN Runtime Fragment Registry Source

`bootstrap-0.4.367` extracts the ordered runtime fragment registry into a dedicated browser source module:

- `src/browser/runtime-fragments-source.js` now owns the source-factory imports and explicit fragment list.
- `src/browser/runtime-assembly-source.js` was reduced to the generic `renderRuntimeFragments(fragments)` renderer plus a call to `browserRuntimeFragments(config)`.
- Static verification checks the fragment registry source, the renderer, runtime-bootstrap config closure, helper-bound status/combat-log/control-login fragments, and generated runtime anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.367` baseline matched byte-for-byte after the extraction, proving the generated browser source is unchanged by the source split.

This is a source-organization split only. It reduces `src/browser/runtime-assembly-source.js` to 15 lines and keeps the fragment ordering explicit in `src/browser/runtime-fragments-source.js`.

## 2026-07-04 Follow-up: Phase 2CO Runtime Assembly Adapter Removal

`bootstrap-0.4.368` removes the empty runtime assembly adapter:

- `src/browser/runtime-source.js` now imports `browserRuntimeFragments()` directly and owns `renderRuntimeFragments(fragments)`.
- `src/browser/runtime-assembly-source.js` is removed because it no longer owned runtime logic or fragment ordering.
- Static verification now requires the legacy assembly adapter to be absent, the runtime source boundary to depend directly on `runtime-fragments-source.js`, and the direct generated runtime to remain free of unresolved runtime imports/requires.
- A fixed-version `--print-source --bot-version bootstrap-0.4.368` hash stayed `cda4cc309a6986d20597be0728c416e17485c34ccf2486fc633bd4d7844ac6d5` before and after the adapter removal, proving the generated browser source is unchanged.

This is a source-organization split only. It completes the remaining browser source assembly audit: no runtime logic is owned by a separate assembly adapter anymore, and `src/browser/runtime-source.js` is now the single browser source boundary.

## 2026-07-04 Follow-up: Phase 2CP Array Count Runtime Helper Module

`bootstrap-0.4.369` starts the true browser runtime-module migration with the smallest pure helper:

- `src/browser/runtime/array-count.js` now owns the actual `arrayCount(value)` implementation as a reusable runtime module.
- `src/browser/array-count-source.js` imports that runtime module and inlines `arrayCount.toString()` with stable indentation, so generated browser source keeps the previous helper text.
- `src/bundler-spike/runtime-entry.mjs` imports and executes the runtime helper module, and the bundler spike self-test now verifies both bundling and runtime execution through `nameCount`.
- Static verification checks the runtime helper module, the source-factory inlining path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.369` hash stayed `8049986c2d9f9b9b0f72a027ed311dd66630c9d1af90873419bc1da57bfcad1d` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It does not change runtime behavior, but it creates the first `src/browser/runtime/` helper owned as executable browser code rather than only as a raw source string.

## 2026-07-04 Follow-up: Phase 2CQ Runtime Utils Helper Module

`bootstrap-0.4.370` continues the true browser runtime-module migration for shared runtime utilities:

- `src/browser/runtime/runtime-utils.js` now owns the executable browser runtime helper exports for `safeStringify()`, `safeJsonClone()`, and `sanitizeCombatLogIdPart()` by reusing `src/shared/runtime-utils.js`.
- `src/browser/runtime-utils-source.js` imports that browser runtime helper module and still inlines the same helper function text, so generated browser source keeps the previous helper output.
- `src/bundler-spike/runtime-entry.mjs` imports runtime utilities through the browser runtime module path, proving the spike can bundle and execute the helper through the same boundary intended for later runtime migration slices.
- Static verification checks the runtime helper module, the source-factory import path, the shared-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.370` hash stayed `4e267062e250b1b9d5646cfd5342d57daf30a2962b0edad219267e0db8037a00` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps the raw generated runtime equivalent while moving the runtime-utils helper ownership one step closer to executable browser modules.

## 2026-07-04 Follow-up: Phase 2CR Display Format Helper Module

`bootstrap-0.4.371` continues the true browser runtime-module migration for display helpers:

- `src/browser/runtime/display-format.js` now owns the executable browser runtime helper exports for `escapeHtml()`, `formatDistance()`, `formatDurationMs()`, `actorLabel()`, and `hpDisplay()` by reusing `src/shared/display-format.js`.
- `src/browser/status-panel-runtime-source.js` imports that browser runtime helper module and still passes the same helper functions into `statusPanelSource(...)`, so generated browser source keeps the previous helper output.
- `src/bundler-spike/runtime-entry.mjs` imports display helpers through the browser runtime module path and still verifies `formatDistance()` execution through the spike status payload.
- Static verification checks the runtime helper module, the source-factory import path, the shared-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.371` hash stayed `9cfa1d3035cbc44e6ecd4c9dccb005e541aa8a5932b7e74c39871d7617a3f182` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps status-panel rendering behavior unchanged while moving display-format helper ownership to executable browser runtime modules.

## 2026-07-04 Follow-up: Phase 2CS Target Whitelist Helper Module

`bootstrap-0.4.372` continues the true browser runtime-module migration for target whitelist helpers:

- `src/browser/runtime/target-whitelist.js` now owns the executable browser runtime helper exports for `normalizeTargetWhitelistName()`, `parseTargetWhitelistNames()`, and `deriveTargetWhitelistUrl()` by reusing `src/shared/target-whitelist.js`.
- `src/browser/runtime-bootstrap-source.js` imports that browser runtime helper module and still inlines the same helper function text into the generated runtime bootstrap.
- `src/bundler-spike/runtime-entry.mjs` imports target whitelist helpers through the browser runtime module path and still verifies `parseTargetWhitelistNames()` execution through the spike status payload.
- Static verification checks the runtime helper module, the bootstrap import path, the shared-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.372` hash stayed `424e16e018860991ad765b35c131b1745ce5c10a2513733e63d0e7529d4741d2` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps whitelist parsing, URL derivation, and generated runtime behavior unchanged while moving target-whitelist helper ownership to executable browser runtime modules.

## 2026-07-04 Follow-up: Phase 2CT Exit Summary Helper Module

`bootstrap-0.4.373` continues the true browser runtime-module migration for exit-summary helpers:

- `src/browser/runtime/exit-summary.js` now owns the executable browser runtime helper exports for stamina exhaustion labels/evidence, offline leave summary text, and combat-log exit summary construction by reusing `src/shared/exit-summary.js`.
- `src/browser/runtime-bootstrap-source.js`, `src/browser/combat-log-runtime-source.js`, and `src/browser/control-login-runtime-source.js` import that browser runtime helper module while keeping the same generated helper text and binding calls.
- `src/bundler-spike/runtime-entry.mjs` imports exit-summary helpers through the browser runtime module path and now verifies `offlineLeaveSummaryText()` execution through the spike status payload.
- Static verification checks the runtime helper module, all three source-factory import paths, the shared-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.373` hash stayed `5e1be70c84c0ad9c6f9b3012b91572ff28c92ec2101cc9c46aaa91132d101da8` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps exit text, stamina hold contradiction checks, combat-log summaries, and generated runtime behavior unchanged while moving exit-summary helper ownership to executable browser runtime modules.

## 2026-07-04 Follow-up: Phase 2CU Browser Preserved-State Helper Module

`bootstrap-0.4.374` continues the true browser runtime-module migration for preserved runtime state:

- `src/browser/runtime/browser-preserved-state.js` now owns the executable browser runtime helper export for `buildBrowserPreservedState()` by reusing `src/shared/browser-preserved-state.js`.
- `src/browser/runtime-bootstrap-source.js` imports that browser runtime helper module and still inlines the same preserved-state function text into the generated runtime bootstrap.
- `src/bundler-spike/runtime-entry.mjs` imports preserved-state helpers through the browser runtime module path and now verifies `buildBrowserPreservedState()` execution through the spike status payload.
- Static verification checks the runtime helper module, the bootstrap import path, the shared-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.374` hash stayed `3b99f3758c730f660131a5a69f07a731208c739afc0abfcd0d5d4244fdbcc86a` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps hot-update state preservation and generated runtime behavior unchanged while moving preserved-state helper ownership to executable browser runtime modules.

## 2026-07-04 Follow-up: Phase 2CV Runtime Defaults Helper Module

`bootstrap-0.4.375` completes the current shared-helper-to-browser-runtime pass for runtime bootstrap defaults:

- `src/browser/runtime/runtime-defaults.js` now owns the executable browser runtime helper export for `buildRuntimeDefaults()` by reusing `src/shared/runtime-defaults.js`.
- `src/browser/runtime-bootstrap-source.js` imports that browser runtime helper module and still inlines the same defaults function text into the generated runtime bootstrap.
- `src/bundler-spike/runtime-entry.mjs` imports runtime defaults through the browser runtime module path and now verifies `buildRuntimeDefaults()` execution through the spike status payload.
- Static verification checks the runtime helper module, the bootstrap import path, the shared-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.375` hash stayed `2dcd9c38de65c0b39830bf30b0024de429079971df5d259b4d5e31ee30357382` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps runtime config/default behavior unchanged while removing the last direct `../shared/*` helper import from `src/browser` runtime source factories.

## 2026-07-04 Follow-up: Phase 2CW Action Priority Helper Module

`bootstrap-0.4.376` starts the strategy-helper-to-browser-runtime adapter pass with action priority helpers:

- `src/browser/runtime/action-priority.js` now owns the executable browser runtime helper exports for action priority bands, focus IDs, focus summaries, and compatibility aliases by reusing `src/strategy/action-priority.js`.
- `src/browser/action-arbitration-source.js` imports action-priority helpers through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports action-priority helpers through the browser runtime module path and continues verifying `actionFocusSummary()` execution through the spike status payload.
- Static verification checks the runtime helper module, the action-arbitration import path, the strategy-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.376` hash stayed `f5ce625f5a35da28bb4ccefb4d231dbb3556a5c393df90cd07d368a84bf815e5` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps final-action arbitration behavior unchanged while moving the first strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2CX Action Switch Diagnostics Helper Module

`bootstrap-0.4.377` continues the strategy-helper-to-browser-runtime adapter pass with action switch diagnostics:

- `src/browser/runtime/action-switch-diagnostics.js` now owns the executable browser runtime helper exports for action switch pair keys, previous-decision summaries, and switch diagnostics recording by reusing `src/strategy/action-switch-diagnostics.js`.
- `src/browser/action-arbitration-source.js` imports action-switch diagnostics through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports action-switch diagnostics through the browser runtime module path and now verifies `recordActionSwitchDiagnosticsCore()` execution through the spike status payload.
- Static verification checks the runtime helper module, the action-arbitration import path, the strategy-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.377` hash stayed `8bd7bff10bd2040959d543716978433d2034204a2a224b0645bb732dfd7747df` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps target-switch diagnostics behavior unchanged while moving the second final-action strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2CY Action Arbitration Helper Module

`bootstrap-0.4.378` completes the current final-action helper adapter pass with action arbitration:

- `src/browser/runtime/action-arbitration.js` now owns the executable browser runtime helper exports for final action band ranking, reusable-action checks, hold-previous decisions, arbitration core execution, and status summaries by reusing `src/strategy/action-arbitration.js`.
- `src/browser/action-arbitration-source.js` imports final-action arbitration through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports final-action arbitration through the browser runtime module path and now verifies `applyFinalActionArbitrationCore()` execution through the spike status payload.
- Static verification checks the runtime helper module, the action-arbitration import path, the strategy-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.378` hash stayed `e4b2ede8d670ef7c940bb338c29f510634ee2816487d43ea02b49463367608a3` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps final-action arbitration behavior unchanged while removing the remaining direct strategy import from `src/browser/action-arbitration-source.js`.

## 2026-07-04 Follow-up: Phase 2CZ Coin Diagnostics Helper Module

`bootstrap-0.4.379` continues the strategy-helper-to-browser-runtime adapter pass with coin diagnostics:

- `src/browser/runtime/coin-diagnostics.js` now owns the executable browser runtime helper exports for coin summaries, filtered-coin diagnostics, diagnostic list summaries, and diagnostics object construction by reusing `src/strategy/coin-diagnostics.js`.
- `src/browser/coin-safety-source.js` imports coin diagnostics through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports coin diagnostics through the browser runtime module path and now verifies `buildCoinDiagnostics()` execution for ignored and snapshot-only nearby coins through the spike status payload.
- Static verification checks the runtime helper module, the coin-safety import path, the strategy-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.379` hash stayed `769436c54ccc13c0a878ad55b651ea12878106199fce281bd8a2b129381c01ba` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps coin diagnostics behavior unchanged while moving the diagnostics strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2DA Coin Motion Helper Module

`bootstrap-0.4.380` continues the strategy-helper-to-browser-runtime adapter pass with coin motion:

- `src/browser/runtime/coin-motion.js` now owns the executable browser runtime helper exports for coin direction, axis approach, pickup pulse timing, axis-lock handling, near-coin approach, and motion metadata by reusing `src/strategy/coin-motion.js`.
- `src/browser/coin-motion-runtime-source.js` imports coin motion through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports coin motion through the browser runtime module path and now verifies `coinDirectionToCore()` plus `coinMotionMetaCore()` execution through the spike status payload.
- Static verification checks the runtime helper module, the coin-motion runtime source import path, the strategy-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.380` hash stayed `6943081f3edfccb7b9c9340f7bba65d9fd6edceb0551b4090983d0f801b4102a` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps coin approach and pickup movement behavior unchanged while moving the coin motion strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2DB Coin Target Helper Module

`bootstrap-0.4.381` continues the strategy-helper-to-browser-runtime adapter pass with coin target helpers:

- `src/browser/runtime/coin-target.js` now owns the executable browser runtime helper exports for coin target keys, tracked-target matching, tracked collection targets, native coin snapshots, point-to-segment distance, incidental pickup detection, snapshot long-travel worth, and snapshot navigation reason by reusing `src/strategy/coin-target.js`.
- `src/browser/coin-target-runtime-source.js` imports coin target helpers through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports coin target helpers through the browser runtime module path and now verifies key construction, native snapshot construction, and tracked-target matching through the spike status payload.
- Static verification checks the runtime helper module, the coin-target runtime source import path, the strategy-helper reuse path, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.381` hash stayed `6b221b5b16c1205666d826400b3d6a3034e53fa35a20679d9d3b38ce09836c78` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps coin target tracking, collection confirmation, and snapshot navigation behavior unchanged while moving the coin target strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2DC Coin Progress Helper Module

`bootstrap-0.4.382` continues the strategy-helper-to-browser-runtime adapter pass with coin progress helpers:

- `src/browser/runtime/coin-progress.js` now owns the executable browser runtime helper exports for coin failure backoff, stale-coin escape direction, coin-progress intent/attempt/progress state transitions, ignored-coin action metadata, and ignored-target cleanup intent by reusing `src/strategy/coin-progress.js`.
- `src/browser/coin-progress-runtime-source.js` imports coin progress helpers through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports coin progress helpers through the browser runtime module path and now verifies failure ignore backoff, attempt update identity, and progress intent detection through the spike status payload.
- Static verification checks the runtime helper module, the coin-progress runtime source import path, the strategy-helper reuse path, runtime state-write anchors, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.382` hash stayed `b1ef7421b42f6e7994974139ba507950086c78c1df0de11919c9098cd2f2bf96` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps coin progress tracking, ignored-coin cleanup, stale-coin escape, and patrol-action behavior unchanged while moving the coin progress strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2DD Coin Route Helper Module

`bootstrap-0.4.383` continues the strategy-helper-to-browser-runtime adapter pass with coin route helpers:

- `src/browser/runtime/coin-route.js` now owns the executable browser runtime helper exports for route keys, route IDs, leg cost/safety checks, point limits, route summaries, action metadata, route construction, closer-first and held-choice guards, route switch hysteresis, and bounded route opportunity picking by reusing `src/strategy/coin-route.js`.
- `src/browser/opportunity-route-source.js` imports coin route helpers through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports coin route helpers through the browser runtime module path and now verifies route key construction plus action metadata rounding through the spike status payload.
- Static verification checks the runtime helper module, the opportunity-route source import path, the strategy-helper reuse path, route wrapper/state anchors, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.383` hash stayed `c2831b106041144f07c0fd6750761de8e786dc386b696ec1eb25ca8fbf302453` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps bounded visible coin route planning, route safety checks, held-route stabilization, and route action metadata unchanged while moving the coin route strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2DE Opportunity Choice Helper Module

`bootstrap-0.4.384` continues the strategy-helper-to-browser-runtime adapter pass with opportunity choice helpers:

- `src/browser/runtime/opportunity-choice.js` now owns the executable browser runtime helper exports for opportunity keys, choice identity, same-choice matching, high-value coin holds, oscillation locks, stable choice selection, missing-held reconstruction, route metadata extraction, and choice persistence by reusing `src/strategy/opportunity-choice.js`.
- `src/browser/opportunity-choice-source.js` imports opportunity choice helpers through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports opportunity choice helpers through the browser runtime module path and now verifies stable held-choice selection plus choice metadata persistence through the spike status payload.
- Static verification checks the runtime helper module, the opportunity-choice source import path, the strategy-helper reuse path, choice wrapper/state anchors, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.384` hash stayed `60eb849dcdb9416eb773ae9055125ed150aadc4b9169b0f31a8d15149501e721` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps opportunity choice stability, high-value coin hold behavior, missing-held reconstruction, and persisted choice metadata unchanged while moving the opportunity choice strategy helper behind an executable browser runtime adapter.

## 2026-07-04 Follow-up: Phase 2DF Opportunity Candidates Helper Module

`bootstrap-0.4.385` continues the strategy-helper-to-browser-runtime adapter pass with opportunity candidate helpers:

- `src/browser/runtime/opportunity-candidates.js` now owns the executable browser runtime helper exports for opportunity stamina-cost normalization, value scoring, priority tiers, coin-route display merging, visible route coin de-duplication, coin/enemy candidate construction, combined opportunity candidates, and best coin score comparison by reusing `src/strategy/opportunity-candidates.js`.
- `src/browser/opportunity-candidate-source.js` imports opportunity candidate helpers through that browser runtime module while still inlining the same helper function text into the generated runtime.
- `src/bundler-spike/runtime-entry.mjs` imports opportunity candidate helpers through the browser runtime module path and now verifies candidate combination, coin candidate metadata, and best coin score execution through the spike status payload.
- Static verification checks the runtime helper module, the opportunity-candidate source import path, the strategy-helper reuse path, candidate wrapper anchors, and the bundler spike import/execution anchors.
- A fixed-version `--print-source --bot-version bootstrap-0.4.385` hash stayed `7d343bbb806b9acd4ab47cd64c5a8a673620e1820b1914abfaf08bed59ab5cef` before and after the helper-module extraction, proving the generated browser source is unchanged.

This is a source-organization split only. It keeps coin/enemy opportunity candidate construction, route display metadata, priority tiers, and best-coin comparison unchanged while moving the opportunity candidate strategy helper behind an executable browser runtime adapter.

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
21. Browser source builder extraction/direct build path: integrated in `bootstrap-0.4.295`
22. Esbuild bundler spike plus page-global adapter: implemented after `bootstrap-0.4.295`
23. Full generated remote runtime esbuild candidate: implemented after `bootstrap-0.4.295`
24. Production esbuild remote build: integrated in `bootstrap-0.4.296`
25. Browser runtime source boundary: integrated in `bootstrap-0.4.297`
26. Page-global core integration: integrated in `bootstrap-0.4.298`
27. Control-login page-global guards: integrated in `bootstrap-0.4.299`
28. Manual login page-global gate: integrated in `bootstrap-0.4.300`
29. Page-native observer globals: integrated in `bootstrap-0.4.301`
30. Page-native snapshot source factory: integrated in `bootstrap-0.4.302`
31. Target whitelist source factory: integrated in `bootstrap-0.4.303`
32. Network quality summary source factory: integrated in `bootstrap-0.4.304`
33. Network quality sampler/ACK source factory: integrated in `bootstrap-0.4.305`
34. Action arbitration source factory: integrated in `bootstrap-0.4.306`
35. Combat history source factory: integrated in `bootstrap-0.4.307`
36. Coin target runtime source factory: integrated in `bootstrap-0.4.308`
37. Native control source factory: integrated in `bootstrap-0.4.309`
38. Coin motion runtime source factory: integrated in `bootstrap-0.4.310`
39. Return-block source factory: integrated in `bootstrap-0.4.311`
40. Entity activity source factory: integrated in `bootstrap-0.4.312`
41. Stamina runtime source factory: integrated in `bootstrap-0.4.313`
42. Exit/relogin hold source factory: integrated in `bootstrap-0.4.314`
43. Pending-exit and pursuit tracking source factory: integrated in `bootstrap-0.4.315`
44. Offline safety assessment source factory: integrated in `bootstrap-0.4.316`
45. Leave command helper source factory: integrated in `bootstrap-0.4.317`
46. Clash leave rescue helper source factory: integrated in `bootstrap-0.4.318`
47. Leave command completion/issue source factory: integrated in `bootstrap-0.4.319`
48. Auto/manual login source factory: integrated in `bootstrap-0.4.320`
49. Leave flow source factory: integrated in `bootstrap-0.4.321`
50. Entity refresh source factory: integrated in `bootstrap-0.4.322`
51. Classify source factory: integrated in `bootstrap-0.4.323`
52. Coin safety source factory: integrated in `bootstrap-0.4.324`
53. Target selection source factory: integrated in `bootstrap-0.4.325`
54. Combat movement source factory: integrated in `bootstrap-0.4.326`
55. Combat aim source factory: integrated in `bootstrap-0.4.327`
56. Combat fire source factory: integrated in `bootstrap-0.4.328`
57. Combat state source factory: integrated in `bootstrap-0.4.329`
58. Combat action source factory: integrated in `bootstrap-0.4.330`
59. Opportunity stamina source factory: integrated in `bootstrap-0.4.331`
60. Combat leave cover source factory: integrated in `bootstrap-0.4.332`
61. Opportunity snapshot source factory: integrated in `bootstrap-0.4.333`
62. Post-attack source factory: integrated in `bootstrap-0.4.334`
63. Opportunity actions source factory: integrated in `bootstrap-0.4.335`
64. Opportunity route source factory: integrated in `bootstrap-0.4.336`
65. Opportunity candidate source factory: integrated in `bootstrap-0.4.337`
66. Opportunity choice source factory: integrated in `bootstrap-0.4.338`
67. Coin progress runtime source factory: integrated in `bootstrap-0.4.339`
68. Opportunity pick source factory: integrated in `bootstrap-0.4.340`
69. Patrol source factory: integrated in `bootstrap-0.4.341`
70. Opportunity clear source factory: integrated in `bootstrap-0.4.342`
71. Exit motion source factory: integrated in `bootstrap-0.4.343`
72. Persistent last-self source factory: integrated in `bootstrap-0.4.344`
73. Persistent exit source factory: integrated in `bootstrap-0.4.345`
74. Persistent clear source factory: integrated in `bootstrap-0.4.346`
75. Pending-exit persistence source factory: integrated in `bootstrap-0.4.347`
76. Refresh exit detail source factory: integrated in `bootstrap-0.4.348`
77. Restored coin failures source factory: integrated in `bootstrap-0.4.349`
78. Login snapshot gate source factory: integrated in `bootstrap-0.4.350`
79. Runtime diagnostics source factory: integrated in `bootstrap-0.4.351`
80. Tick safety source factory: integrated in `bootstrap-0.4.352`
81. Attack-worth source factory: integrated in `bootstrap-0.4.353`
82. Array-count source factory: integrated in `bootstrap-0.4.354`
83. Choose-action source factory: integrated in `bootstrap-0.4.355`
84. Tick loop source factory: integrated in `bootstrap-0.4.356`
85. Startup install/restore tail source factory: integrated in `bootstrap-0.4.357`
86. Bot object/status source factory: integrated in `bootstrap-0.4.358`
87. Runtime bootstrap source factory: integrated in `bootstrap-0.4.359`
88. Runtime assembly boundary rename: integrated in `bootstrap-0.4.360`
89. Runtime assembly fragment registry: integrated in `bootstrap-0.4.361`
90. Restored runtime state source factory: integrated in `bootstrap-0.4.362`
91. Runtime utility source factory: integrated in `bootstrap-0.4.363`
92. Status panel runtime source factory: integrated in `bootstrap-0.4.364`
93. Combat-log runtime source factory: integrated in `bootstrap-0.4.365`
94. Control-login runtime source factory: integrated in `bootstrap-0.4.366`
95. Runtime fragment registry source: integrated in `bootstrap-0.4.367`
96. Remaining browser source assembly audit / adapter removal: integrated in `bootstrap-0.4.368`
97. Array-count true runtime helper module: integrated in `bootstrap-0.4.369`
98. Runtime-utils true runtime helper module: integrated in `bootstrap-0.4.370`
99. Display-format true runtime helper module: integrated in `bootstrap-0.4.371`
100. Target-whitelist true runtime helper module: integrated in `bootstrap-0.4.372`
101. Exit-summary true runtime helper module: integrated in `bootstrap-0.4.373`
102. Browser preserved-state true runtime helper module: integrated in `bootstrap-0.4.374`
103. Runtime-defaults true runtime helper module: integrated in `bootstrap-0.4.375`
104. Action-priority true runtime helper module: integrated in `bootstrap-0.4.376`
105. Action-switch diagnostics true runtime helper module: integrated in `bootstrap-0.4.377`
106. Action-arbitration true runtime helper module: integrated in `bootstrap-0.4.378`
107. Coin-diagnostics true runtime helper module: integrated in `bootstrap-0.4.379`
108. Coin-motion true runtime helper module: integrated in `bootstrap-0.4.380`
109. Coin-target true runtime helper module: integrated in `bootstrap-0.4.381`
110. Coin-progress true runtime helper module: integrated in `bootstrap-0.4.382`
111. Coin-route true runtime helper module: integrated in `bootstrap-0.4.383`
112. Opportunity-choice true runtime helper module: integrated in `bootstrap-0.4.384`
113. Opportunity-candidates true runtime helper module: integrated in `bootstrap-0.4.385`
114. Post-attack-drop true runtime helper module: integrated in `bootstrap-0.4.386`
115. Stamina-budget true runtime helper module: integrated in `bootstrap-0.4.387`
116. Opportunity-constants true runtime helper module: integrated in `bootstrap-0.4.388`
117. Named runtime fragment registry boundary: integrated in `bootstrap-0.4.389`
118. Explicit runtime fragment names: integrated in `bootstrap-0.4.390`
119. Named-only runtime fragment rendering contract: integrated in `bootstrap-0.4.391`
120. Runtime fragment entries/materializer split: integrated in `bootstrap-0.4.392`
121. Bundler-owned `array-count` runtime fragment for remote builds: integrated in `bootstrap-0.4.393`
122. Bundler-owned `runtime-utils` runtime fragment for remote builds: integrated in `bootstrap-0.4.394`
123. Bundler-owned `runtime-bootstrap` shared helper bindings for remote builds: integrated in `bootstrap-0.4.395`
124. Bundler-owned `status-panel-runtime` display-format bindings for remote builds: integrated in `bootstrap-0.4.396`
125. Bundler-owned `combat-log-runtime` exit-summary binding for remote builds: integrated in `bootstrap-0.4.397`
126. Bundler-owned `control-login-runtime` stamina label binding for remote builds: integrated in `bootstrap-0.4.398`
127. Bundler-owned `coin-motion-runtime` helper bindings for remote builds: integrated in `bootstrap-0.4.399`
128. Bundler-owned `coin-target-runtime` helper bindings for remote builds: integrated in `bootstrap-0.4.400`
129. Bundler-owned `coin-progress-runtime` helper bindings for remote builds: integrated in `bootstrap-0.4.401`
130. Bundler-owned `coin-safety` diagnostics helper bindings for remote builds: integrated in `bootstrap-0.4.402`
131. Bundler-owned `opportunity-stamina` stamina-budget helper bindings for remote builds: integrated in `bootstrap-0.4.403`
132. Bundler-owned `post-attack` drop helper bindings for remote builds: integrated in `bootstrap-0.4.404`
133. Bundler-owned `opportunity-route` coin-route helper bindings for remote builds: integrated in `bootstrap-0.4.405`
134. Bundler-owned `opportunity-candidate` helper bindings for remote builds: integrated in `bootstrap-0.4.406`
135. Bundler-owned `opportunity-choice` helper bindings for remote builds: integrated in `bootstrap-0.4.407`
136. Bundler-owned `action-arbitration` priority/switch/final-action helper bindings for remote builds: integrated in `bootstrap-0.4.408`
137. Bundler-owned `opportunity-clear` helper binding for remote builds: integrated in `bootstrap-0.4.409`
138. Bundler-owned `opportunity-pick` helper binding for remote builds: integrated in `bootstrap-0.4.410`
139. Bundler-owned `patrol` direction helper binding for remote builds: integrated in `bootstrap-0.4.411`
140. Bundler-owned `attack-worth` helper binding for remote builds: integrated in `bootstrap-0.4.412`
141. Bundler-owned `exit-motion` helper binding for remote builds: integrated in `bootstrap-0.4.413`
142. Bundler-owned `persistent-clear` helper binding for remote builds: integrated in `bootstrap-0.4.414`
143. Bundler-owned `persistent-last-self` helper binding for remote builds: integrated in `bootstrap-0.4.415`
144. Bundler-owned `persistent-exit` helper binding for remote builds: integrated in `bootstrap-0.4.416`
145. Bundler-owned `restored-coin-failures` helper binding for remote builds: integrated in `bootstrap-0.4.417`
146. Bundler-owned `login-snapshot-gate` helper binding for remote builds: integrated in `bootstrap-0.4.418`
147. Bundler-owned `refresh-exit-detail` helper binding for remote builds: integrated in `bootstrap-0.4.419`
148. Bundler-owned `pending-exit-persistence` helper binding for remote builds: integrated in `bootstrap-0.4.420`
149. Bundler-owned `restored-runtime-state` helper binding for remote builds: integrated in `bootstrap-0.4.421`
150. Bundler-owned `runtime-diagnostics` helper binding for remote builds: integrated in `bootstrap-0.4.422`
151. Bundler-owned `exit-relogin` display helper binding for remote builds: integrated in `bootstrap-0.4.423`
152. Bundler-owned `exit-relogin` actor/repeat-delay helper binding for remote builds: integrated in `bootstrap-0.4.424`
153. Bundler-owned `exit-relogin` enemy leave streak helper binding for remote builds: integrated in `bootstrap-0.4.425`
154. Bundler-owned `exit-relogin` summary helper binding for remote builds: integrated in `bootstrap-0.4.426`
155. Bundler-owned `exit-relogin` hold/suppress base helper binding for remote builds: integrated in `bootstrap-0.4.427`
156. Bundler-owned `exit-relogin` hold read/clear helper binding for remote builds: integrated in `bootstrap-0.4.428`
157. Bundler-owned `exit-relogin` hold cleanup helper binding for remote builds: integrated in `bootstrap-0.4.429`
158. Bundler-owned `exit-relogin` offline suppress prefix helper binding for remote builds: integrated in `bootstrap-0.4.430`
159. Bundler-owned `exit-relogin` pending unsafe suppress helper binding for remote builds: integrated in `bootstrap-0.4.431`
160. Bundler-owned `exit-relogin` start-exit-audit helper binding for remote builds: integrated in `bootstrap-0.4.432`
161. Bundler-owned `exit-relogin` suppress writer helper binding for remote builds: integrated in `bootstrap-0.4.433`
162. Bundler-owned `exit-relogin` enemy suppress wrapper helper binding for remote builds: integrated in `bootstrap-0.4.434`
163. Bundler-owned `exit-relogin` stamina hold selector binding for remote builds: integrated in `bootstrap-0.4.435`
164. Bundler-owned `exit-relogin` offline suppress binding for remote builds: integrated in `bootstrap-0.4.436`
165. Bundler-owned `exit-relogin` pending stamina suppress binding for remote builds: integrated in `bootstrap-0.4.437`
166. Bundler-owned `exit-relogin` hold read/clear binding for remote builds: integrated in `bootstrap-0.4.438`
167. Bundler-owned `exit-relogin` hold cleanup binding for remote builds: integrated in `bootstrap-0.4.439`
168. Bundler-owned `exit-relogin` pending unsafe suppress binding for remote builds: integrated in `bootstrap-0.4.440`
169. Bundled `exit-relogin` pending unsafe suppress wrapper cleanup for remote builds: integrated in `bootstrap-0.4.441`
170. Bundler-owned `exit-relogin` start-exit-audit bound helper for remote builds: integrated in `bootstrap-0.4.442`
171. Bundled `exit-relogin` stamina budget hold wrapper cleanup for remote builds: integrated in `bootstrap-0.4.443`
172. Bundled `exit-relogin` suppress reason wrapper cleanup for remote builds: integrated in `bootstrap-0.4.444`
173. Removed `exit-relogin` enemy suppress fixed-reason wrapper in favor of direct suppress writer calls: integrated in `bootstrap-0.4.445`
174. Removed bundled `exit-relogin` offline unsafe predicate wrapper by routing `leave-flow` directly to the runtime core: integrated in `bootstrap-0.4.446`
175. Removed bundled `exit-relogin` stamina hold selector wrapper after suppress/pending-stamina paths moved to runtime-bound cores: integrated in `bootstrap-0.4.447`
176. Removed bundled `exit-relogin` pending unsafe suppress wrapper by routing `leave-flow` directly to the runtime-bound core: integrated in `bootstrap-0.4.448`
177. Removed bundled `exit-relogin` start-exit-audit wrapper by routing `leave-flow` directly to the runtime-bound core: integrated in `bootstrap-0.4.449`
178. Removed bundled `exit-relogin` offline suppress wrapper by routing `pending-exit` directly to the runtime-bound core: integrated in `bootstrap-0.4.450`
179. Removed bundled `exit-relogin` pending stamina suppress wrapper by routing `leave-flow` directly to the runtime-bound core: integrated in `bootstrap-0.4.451`
180. Added a runtime-bound `exit-relogin` suppress writer and routed bundled `pending-exit` enemy suppress calls directly to it: integrated in `bootstrap-0.4.452`
181. Removed bundled `exit-relogin` suppress writer wrapper by binding offline suppress delegation inside `setOfflineLeaveSuppressBoundCore()`: integrated in `bootstrap-0.4.453`
182. Removed bundled `exit-relogin` enemy-leave streak wrappers by binding status reads and suppress-writer streak updates through runtime bound cores: integrated in `bootstrap-0.4.454`
183. Removed bundled `exit-relogin` clear relogin hold wrappers by routing tick recovery and stale offline hold cleanup directly through runtime bound cores: integrated in `bootstrap-0.4.455`
184. Removed unused bundled `exit-relogin` actor wrappers after streak/suppress paths moved actor resolution into runtime bound cores: integrated in `bootstrap-0.4.456`
185. Removed the bundled `exit-relogin` login-suppress clear wrapper by routing pending-exit suppress writers and 403 recovery directly through `clearLoginSuppressMatchingBoundCore()`: integrated in `bootstrap-0.4.457`
186. Removed the bundled `exit-relogin` wait-display wrapper by binding `finalizeLeaveDisplayReasonCore()` directly to `leaveWaitDisplayCore()` for remote builds: integrated in `bootstrap-0.4.458`
187. Removed the bundled `exit-relogin` HP relogin-delay wrapper by passing direct `reloginDelayForHpCore()` helper bindings into pending-exit and leave-flow runtime-bound suppress helpers: integrated in `bootstrap-0.4.459`
188. Removed the bundled `exit-relogin` offline display-reason wrapper by routing tick and combat-state display construction directly through `currentOfflineDisplayReasonCore()`: integrated in `bootstrap-0.4.460`
189. Removed the bundled `exit-relogin` injury summary wrapper by routing tick pending-injury and leave-flow injury summaries directly through `injuryLeaveSummaryCore()`: integrated in `bootstrap-0.4.461`
190. Removed the bundled `exit-relogin` pursuit summary wrapper by routing tick pending-pursuit and leave-flow pursuit summaries directly through `pursuitLeaveSummaryCore()`: integrated in `bootstrap-0.4.462`
191. Removed the bundled `exit-relogin` offline summary wrapper by routing tick, leave-flow, and refresh-exit-detail summaries directly through `offlineLeaveSummaryCore()`: integrated in `bootstrap-0.4.463`
192. Removed the bundled `exit-relogin` combat summary wrapper by routing leave-flow combat summaries and combat leave-action helper binding directly through `combatExitSummaryCore()`: integrated in `bootstrap-0.4.464`
193. Removed the bundled `exit-relogin` combat leave-action wrapper by routing combat-action leave construction directly through `combatLeaveActionCore()`: integrated in `bootstrap-0.4.465`
194. Removed the bundled `exit-relogin` enemy/offline relogin hold reader wrappers by routing tick, pending-exit, leave-flow, combat-log, and control-login directly through bound hold-reader cores: integrated in `bootstrap-0.4.466`
195. Removed the bundled `exit-relogin` display finalizer wrapper by routing refresh-exit-detail, pending-exit, leave-flow, and control-login directly through `finalizeLeaveDisplayReasonCore()` / `leaveWaitDisplayCore()`: integrated in `bootstrap-0.4.467`
196. Removed the bundled pending-exit reload-confirmation wrapper by routing pending-exit and control-login directly through `normalizePendingExitReloadConfirmationCore()`: integrated in `bootstrap-0.4.468`
197. Removed the bundled pending-exit storage-normalizer wrapper after reader, writer, and initial-state chooser paths moved fully through runtime core calls: integrated in `bootstrap-0.4.469`
198. Removed the bundled pending-exit persistence reader and initial-state chooser wrappers by routing restored-runtime-state directly through `readPersistedPendingExitStateCore()` / `chooseInitialPendingExitStateCore()`: integrated in `bootstrap-0.4.470`
199. Removed the bundled pending-exit persistence writer wrapper by routing control-login, pending-exit, leave-command, and relogin-hold cleanup paths through direct `writePersistentPendingExitStateCore()` call helpers: integrated in `bootstrap-0.4.471`
200. Removed the bundled restored coin-failures wrapper by routing restored-runtime-state directly through `restoredCoinFailuresCore()`: integrated in `bootstrap-0.4.472`
201. Removed the bundled login-snapshot-gate state normalizer wrapper by routing bot-object and control-login directly through `normalizeLoginSnapshotGateStateCore()`: integrated in `bootstrap-0.4.473`
202. Removed the bundled login-snapshot-gate required-count wrapper by routing bot-object and control-login directly through `loginSnapshotSuccessRequiredCore()`: integrated in `bootstrap-0.4.474`
203. Removed the bundled runtime-diagnostics recorder wrapper by routing tick-safety, page-native-snapshot, entity-refresh, and combat-log directly through `recordRuntimeDiagnosticsCore()`: integrated in `bootstrap-0.4.475`
204. Removed the coin-motion metadata wrapper by routing choose-action, post-attack, and opportunity-actions directly through `coinMotionMetaCore()`: integrated in `bootstrap-0.4.476`
205. Removed the coin-target identity wrappers by routing combat-history, tracked coin visibility, and opportunity-choice visible-missing checks directly through `coinTargetKeyCore()` / `coinMatchesTrackedTargetCore()`: integrated in `bootstrap-0.4.477`
206. Removed the coin-target tracked collection wrapper by routing `markCoinCollected()` directly through `trackedCoinTargetForCollectionCore()`: integrated in `bootstrap-0.4.478`
207. Removed the production bundled attack-worth wrapper by routing target-selection and opportunity-actions directly through `attackWorthTakingCore()` while keeping local/CDP wrapper fallback: integrated in `bootstrap-0.4.479`
208. Removed the production bundled opportunity-pick wrapper by routing choose-action directly through `pickBestOpportunityCore()` while keeping local/CDP wrapper fallback: integrated in `bootstrap-0.4.480`
209. Removed the unused production bundled patrol direction wrapper by keeping only the `patrolDirectionCore` binding while preserving local/CDP wrapper fallback: integrated in `bootstrap-0.4.481`
210. Removed the obsolete `exitMotionStopActive()` alias by routing target-overlay suppression directly through `exitMotionStopLockRemainingMs() > 0`: integrated in `bootstrap-0.4.482`
211. Routed bundled post-exit cleanup and tick post-exit wait publishing directly through `postExitDecisionWithoutTargetCore()` while keeping the earlier bot-status display wrapper boundary: integrated in `bootstrap-0.4.483`
212. Removed the production bundled post-exit decision wrapper by routing bot-status display, post-exit cleanup, and tick post-exit wait publishing directly through `postExitDecisionWithoutTargetCore()` while preserving local/CDP wrapper fallback: integrated in `bootstrap-0.4.484`
213. Removed the production bundled opportunity-clear wrapper by routing choose-action, opportunity-choice, coin-progress, and coin-target cleanup sites directly through `shouldClearOpportunityChoiceCore()` while preserving local/CDP wrapper fallback: integrated in `bootstrap-0.4.485`
214. Removed unused production bundled opportunity-choice high-value helper wrappers while keeping the actual high-value hold behavior in `chooseStableOpportunityCore()` / `highValueCoinHoldBlocksEnemySwitchCore()`: integrated in `bootstrap-0.4.486`
215. Removed unused production bundled opportunity-choice wrapper declarations for locked choice, oscillation lock, choice matching, missing-hold time, and missing-visible authority while preserving local/CDP fallback and strategy core behavior: integrated in `bootstrap-0.4.487`
216. Removed unused production bundled stamina-budget/opportunity-stamina wrappers by routing choose-action nearest stamina exit, daily final coin, and stamina wait summaries directly through strategy cores while preserving local/CDP fallback: integrated in `bootstrap-0.4.488`
217. Removed grouped production bundled route/ROI/snapshot/post-attack wrappers by routing coin-route selection, opportunity value scoring, snapshot worth/reason checks, and post-attack visible-coin checks directly through strategy/runtime cores while preserving local/CDP fallback: integrated in `bootstrap-0.4.489`
218. Removed grouped production bundled opportunity-choice and post-attack picker wrappers by routing missing-held choice construction, stable choice selection, choice persistence, drop-coin picking, and drop-wait picking directly through strategy/runtime cores while preserving local/CDP fallback: integrated in `bootstrap-0.4.490`
219. Removed grouped production bundled opportunity-candidate wrappers by routing route coin de-duplication, best coin score comparison, and enemy candidate filtering directly through strategy/runtime cores while preserving local/CDP fallback: integrated in `bootstrap-0.4.491`
220. Removed grouped production bundled coin-runtime wrappers by routing coin movement direction, coin-progress state transitions, native coin snapshots, tracked visibility, pickup session accounting, snapshot pruning, and snapshot memory refresh through direct strategy/runtime core snippets while preserving local/CDP fallback: integrated in `bootstrap-0.4.492`
221. Removed grouped production pending-exit leave helper wrappers by routing leave HTTP 403 detection, leave success detection, leave-success reload-confirmation construction/satisfaction, and wait-reason selection through `src/strategy/pending-exit.js` / `src/browser/runtime/pending-exit.js` cores while preserving local/CDP fallback: integrated in `bootstrap-0.4.496`
222. Removed grouped production leave-command and Clash rescue wrappers by routing result summaries, failed-detail detection, stage selection, retry-detail construction, retry summaries, and round reset through `src/strategy/leave-command.js` / `src/browser/runtime/leave-command.js` cores while preserving local/CDP fallback: integrated in `bootstrap-0.4.497`
223. Switched local CDP injection and `--print-source` to an esbuild runtime eval bundle and made browser runtime config bundled-only by default, turning the remaining non-bundled inline source branches into dead compatibility code: integrated in `bootstrap-0.4.498`
138. Combat/profit/safety helpers: integrate only in small, replay-validated slices
139. Run live validation sessions after each behavior-touching replacement

### Phase 3: Further Extraction
1. Replace generated source-fragment factories behind `src/browser/runtime-source.js` with a true browser runtime entry in validated slices
2. Convert selected shared/browser helpers from CommonJS-source injection to true browser ESM modules
3. Continue migrating remaining direct page-global access through `src/browser/page-global-core.js` before converting live runtime slices to true ESM ownership
4. Profit/opportunity selection module
5. Safety/avoidance module
6. Movement execution module
7. State management utilities

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

## 2026-07-04 Follow-up: Production Direct-Call Acceleration

`bootstrap-0.4.493` follows the faster production-bundle migration direction:

- Bundled `tick()` now expands final-action arbitration and target-switch diagnostics through direct `applyFinalActionArbitrationCore(...)` / `recordActionSwitchDiagnosticsCore(...)` snippets with explicit runtime state, instead of declaring production wrapper functions.
- Drop-matched kill attribution was extracted to `src/strategy/drop-matched-kill.js` and exposed through `src/browser/runtime/drop-matched-kill.js`.
- Bundled post-attack and coin-pickup paths now call `buildDropMatchedKillCore(...)` directly and pass the returned kill record into `recordKillHistoryItem(...)`; final dist no longer declares `recordDropMatchedKill()`.
- Local CDP/`--print-source` compatibility keeps the old wrapper source shape where useful, while production build verification rejects the removed wrapper declarations.

`bootstrap-0.4.494` continues that direction through the pending-exit boundary:

- Pending-exit retry duration, display reason, and status-summary construction now live in `src/strategy/pending-exit.js`, exposed to browser builds through `src/browser/runtime/pending-exit.js`.
- Bundled pending-exit, pending-exit persistence, and Clash leave retry display paths now call the pending-exit cores directly; local CDP generation keeps wrapper fallbacks.
- Final production dist no longer declares `pendingExitRetryMs()` or `pendingExitDisplayReason()`, and verifier now rejects those production wrappers.
- Strategy self-tests cover pending-exit retry floors, display fallback, reload/combat-cover summary normalization, and last-error propagation.

`bootstrap-0.4.495` removes the remaining bundled pending-exit summary wrapper:

- `src/browser/pending-exit-summary-call-source.js` generates direct `summarizePendingExitCore(...)` call expressions with explicit retry/reload options and unique runtime aliases per fragment.
- Bundled bot status, combat-log, control-login, tick, leave-command, and pending-exit internals no longer call a production `summarizePendingExit()` function.
- The local CDP/inline generation path still keeps the wrapper fallback, while the production verifier rejects `function summarizePendingExit(` in generated/final dist.

`bootstrap-0.4.496` broadens the pending-exit migration in a single grouped slice:

- `src/strategy/pending-exit.js` now owns leave HTTP 403 detection, leave success detection, leave-success reload-confirmation construction/satisfaction, and pending-exit wait-reason selection.
- `src/browser/pending-exit-source.js` and `src/browser/leave-command-source.js` generate direct bundled calls to those cores, with explicit reload-normalization dependency injection where needed.
- Final production dist no longer declares the removed pending-exit leave helper wrappers, and verifier rejects those wrapper declarations in generated/final output.

`bootstrap-0.4.497` continues the grouped direct-call migration through leave-command and Clash rescue helpers:

- `src/strategy/leave-command.js` now owns leave-command failure/result summaries, Clash rescue failure detection, ordered retry stage selection, retry detail construction, result summary formatting, and per-round reset decisions.
- `src/browser/runtime/leave-command.js` exposes those cores to bundled browser builds; `src/browser/leave-command-source.js` and `src/browser/pending-exit-source.js` call them directly in production while keeping local CDP fallback wrappers.
- Strategy self-tests add seven leave-command cases, raising the strategy suite to 107 passing cases.
- Final production dist no longer declares the removed leave-command/Clash rescue helper wrappers, and verifier rejects those wrapper declarations in generated/final output.

`bootstrap-0.4.498` changes the local runtime entry direction:

- `grasp-rat-bot.js` now injects and prints `browserRuntimeEvalSourceFor(...)` from `scripts/remote-bot-bundle.js` instead of direct `browserRuntimeSource(...)`.
- The new eval bundle wraps the generated browser runtime as an esbuild IIFE, exports the startup promise as default, and returns that default so CDP `Runtime.evaluate(... awaitPromise: true)` still receives startup status.
- `src/browser/runtime-source.js` defaults `bundledRuntime: true`, so local, print-source, and production paths all select the same bundled-runtime fragment shape.
- Static verification now generates the eval bundle, syntax-checks it, rejects unresolved relative imports/requires, and checks that the main file no longer imports the direct runtime source boundary.
