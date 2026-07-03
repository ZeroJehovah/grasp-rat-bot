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
71. Constants: partially integrated for high-value coin defaults
72. Combat/profit/safety helpers: integrate only in small, replay-validated slices
73. Run live validation sessions after each behavior-touching replacement

### Phase 3: Further Extraction
1. Replace the internal `browserBotSource()` full-source generator behind `src/browser/runtime-source.js` with a true browser runtime entry in validated slices
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
