# Runtime Bundler Migration Plan - 2026-07-05

This plan starts from `main` after `bootstrap-0.4.516`.

Baseline:

- Latest released runtime slice: `bootstrap-0.4.516`.
- Latest code release commit: `6ecf703` (`Release bootstrap 0.4.516 remove empty exit relogin fragment`).
- Latest handoff commit at plan time: `8433ac7`.
- `src/browser/*source.js`: 58 files, 18,965 lines.
- `src/browser/runtime/*.js`: 39 executable modules, 2,048 lines.
- `src/browser/runtime-fragment-registry.js`: 54 named runtime fragment entries.
- Non-registry source-generation files: 8 files (`runtime-source.js`, `runtime-entry-source.js`, `opportunity-route-source.js`, and five `*-call-source.js` helpers).

## Migration Target

The target is to remove the browser source-string fragment layer and make production/local runtime generation flow through real bundler entries and executable browser runtime modules.

End-state expectations:

- `src/browser/runtime/*.js` and new domain runtime modules own executable browser behavior.
- `src/browser/*source.js` files are deleted or reduced to a temporary build adapter only where unavoidable during the final cutover.
- `src/browser/runtime-fragment-registry.js` no longer orders source factories; it is either removed or replaced by a direct runtime entry import list.
- `src/browser/runtime-source.js` no longer materializes named source fragments into one generated source string.
- `scripts/remote-bot-bundle.js` bundles actual entry modules instead of virtual modules backed by generated source strings.
- `scripts/verify-objective-build.js` checks the new module graph, final dist, and absence of obsolete source-generation files.

## Remaining Inventory

### Registry Fragments

The registry still owns 54 source-backed fragments:

`runtime-bootstrap`, `runtime-state-bindings`, `bot-object`, `entity-activity`, `target-whitelist`, `stamina-runtime`, `attack-worth`, `exit-motion`, `target-overlay`, `status-panel-runtime`, `runtime-utility-prelude`, `combat-log-runtime`, `tick-safety`, `control-login-runtime`, `page-native-snapshot`, `pending-exit`, `leave-command`, `auto-login`, `leave-flow`, `native-state`, `runtime-summary`, `network-quality`, `network-quality-summary`, `important-log`, `combat-history`, `entity-refresh`, `native-control`, `coin-motion-runtime`, `return-block`, `classify`, `offline-safety`, `coin-safety`, `target-selection`, `combat-movement`, `combat-aim`, `opportunity-stamina`, `combat-state`, `combat-fire`, `combat-leave-cover`, `combat-action`, `opportunity-snapshot`, `opportunity-candidate`, `post-attack`, `opportunity-actions`, `opportunity-choice`, `opportunity-pick`, `patrol`, `opportunity-clear`, `coin-progress-runtime`, `action-arbitration`, `coin-target-runtime`, `choose-action`, `tick`, and `startup`.

### Thin Or Wrapper-Like Source Files

These are the most direct cleanup candidates:

- `attack-worth-source.js` (9 lines)
- `opportunity-pick-source.js` (9 lines)
- `patrol-source.js` (9 lines)
- `runtime-utils-source.js` (9 lines)
- `opportunity-clear-source.js` (10 lines)
- `exit-motion-source.js` (35 lines)
- `runtime-state-bindings-source.js` (46 lines)
- `runtime-bootstrap-source.js` (57 lines)
- `tick-safety-source.js` (61 lines)

### Non-Registry Source Helpers

These should be removed before the final entry cutover:

- `opportunity-clear-call-source.js`
- `pending-exit-persistence-call-source.js`
- `pending-exit-summary-call-source.js`
- `exit-relogin-display-call-source.js`
- `exit-relogin-hold-read-call-source.js`
- `opportunity-route-source.js` (only used by `opportunity-candidate-source.js`)
- `runtime-entry-source.js`
- `runtime-source.js`

### Large Source-String Fragments

These are the main migration mass by current line count:

- `control-login-source.js` - 2,246 lines
- `combat-log-source.js` - 1,708 lines
- `pending-exit-source.js` - 1,026 lines
- `combat-movement-source.js` - 1,026 lines
- `tick-source.js` - 913 lines
- `important-log-source.js` - 744 lines
- `native-state-source.js` - 718 lines
- `combat-fire-source.js` - 671 lines
- `runtime-summary-source.js` - 641 lines
- `choose-action-source.js` - 620 lines
- `target-overlay-source.js` - 557 lines
- `combat-state-source.js` - 555 lines
- `bot-object-source.js` - 540 lines
- `combat-action-source.js` - 532 lines

## Planned Release Slices

Plan count from this baseline: 8 remaining migration release slices. This keeps the earlier 10-slice direction intact: `.515` and `.516` are already done, and `.517` through `.524` finish the migration.

The count below is release-slice count. The repository gate may still create a paired documentation commit per slice unless code and docs are intentionally committed together.

### 1. `bootstrap-0.4.517` - Thin Prelude Wrapper Collapse

Target:

- Remove the smallest source factories that only return runtime `require(...)` prelude text.
- Inline or replace their source output at the registry/entry boundary.

Primary files:

- `attack-worth-source.js`
- `opportunity-pick-source.js`
- `patrol-source.js`
- `opportunity-clear-source.js`
- `runtime-utils-source.js`
- stretch target: `exit-motion-source.js`

Verification focus:

- Final dist still bundles `attack-worth`, `opportunity-pick`, `patrol`, `opportunity-clear`, `runtime-utils`, `array-count`, and `exit-motion` helpers.
- Verifier rejects the deleted wrapper files and obsolete registry imports.

### 2. `bootstrap-0.4.518` - Source Helper Generator Cleanup

Target:

- Remove helper modules that generate small call expressions.
- Move the remaining call expression construction into either the owning consumer fragment or an executable browser runtime helper.

Primary files:

- `opportunity-clear-call-source.js`
- `pending-exit-persistence-call-source.js`
- `pending-exit-summary-call-source.js`
- `exit-relogin-display-call-source.js`
- `exit-relogin-hold-read-call-source.js`
- `opportunity-route-source.js`

Verification focus:

- Consumers still clear opportunity choice, summarize pending exits, persist pending exits, finalize leave display reasons, and read relogin holds through direct runtime helper calls.
- `opportunity-candidate-source.js` no longer imports a separate route source generator.

### 3. `bootstrap-0.4.519` - Runtime Bootstrap And State Entry Modules

Target:

- Convert bootstrap/state/tick safety shell fragments from source strings to direct runtime entry modules.
- Make the first real runtime-entry module own ordering for initialization-sensitive bindings.

Primary files:

- `runtime-bootstrap-source.js`
- `runtime-state-bindings-source.js`
- `tick-safety-source.js`
- `startup-source.js`
- related `src/browser/runtime/runtime-bootstrap-bindings.js`
- related `src/browser/runtime/runtime-state-bindings.js`

Verification focus:

- Page-global adapter, runtime config/defaults, preserved state, persistent state, pending-exit persistence, and tick safety still initialize in the same order.
- Helper-entry self-test exercises the new entry module path.

### 4. `bootstrap-0.4.520` - Coin And Opportunity Domain Runtime Cutover

Target:

- Move the coin/opportunity source-string fragments to executable runtime modules and direct bundler imports.
- Keep strategy-core calls unchanged, but stop emitting them as generated source text.

Primary files:

- `coin-motion-runtime-source.js`
- `coin-progress-runtime-source.js`
- `coin-target-runtime-source.js`
- `coin-safety-source.js`
- `opportunity-stamina-source.js`
- `opportunity-snapshot-source.js`
- `opportunity-candidate-source.js`
- `opportunity-actions-source.js`
- `opportunity-choice-source.js`
- `opportunity-pick-source.js` if not removed in `.517`
- `opportunity-clear-source.js` if not removed in `.517`
- `post-attack-source.js`
- `action-arbitration-source.js`

Verification focus:

- Ordinary profit flow still prioritizes realtime/native visible coins and visible/native AFK targets before snapshot fallback.
- Coin diagnostics, route planning, progress tracking, ignored-coin cleanup, opportunity stability, post-attack drops, and final action arbitration still call the existing strategy/runtime cores.

### 5. `bootstrap-0.4.521` - Combat Domain Runtime Cutover

Target:

- Move combat source fragments into runtime modules, keeping realtime/native-visible combat constraints intact.

Primary files:

- `combat-movement-source.js`
- `combat-aim-source.js`
- `combat-state-source.js`
- `combat-fire-source.js`
- `combat-leave-cover-source.js`
- `combat-action-source.js`
- `target-selection-source.js`
- `classify-source.js`
- `return-block-source.js`
- `stamina-runtime-source.js`

Verification focus:

- Combat target, aim, and fire decisions still use realtime/native visible state only.
- Existing combat self-tests and replay self-tests continue to pass.
- Final dist still contains no snapshot-driven combat target/aim/fire fallback.

### 6. `bootstrap-0.4.522` - Exit, Pending, Login, And Control Runtime Cutover

Target:

- Move exit/session/control flow source fragments into executable runtime modules.
- Keep current pending-exit durability and relogin safety behavior intact.

Primary files:

- `pending-exit-source.js`
- `leave-command-source.js`
- `leave-flow-source.js`
- `control-login-source.js`
- `auto-login-source.js`
- `offline-safety-source.js`
- `page-native-snapshot-source.js`
- `entity-refresh-source.js`
- `bot-object-source.js`

Verification focus:

- Pending exit persistence, leave confirmation, HTTP 403 rescue, login-point safety, game-session no-self leave, and control-login takeover behavior remain covered.
- Final dist still blocks unsafe relogin/reload until required logs and pending exits are handled.

### 7. `bootstrap-0.4.523` - UI, Logging, Native, And Network Runtime Cutover

Target:

- Move the remaining browser UI, logging, native transport, and network summary fragments out of source strings.

Primary files:

- `status-panel-source.js`
- `target-overlay-source.js`
- `target-whitelist-source.js`
- `combat-log-source.js`
- `important-log-source.js`
- `combat-history-source.js`
- `runtime-summary-source.js`
- `native-state-source.js`
- `native-control-source.js`
- `network-quality-source.js`
- `network-quality-summary-source.js`
- `entity-activity-source.js`

Verification focus:

- Status panel, overlay, target whitelist, combat logs, important logs, runtime status, native WebSocket movement/shooting, and network quality diagnostics still render/report correctly in generated dist.
- `npm run test:remote-bundled` and `node scripts/verify-objective-build.js` prove final bundling has no unresolved runtime imports.

### 8. `bootstrap-0.4.524` - Final Entry And Registry Cutover

Target:

- Remove or collapse the remaining source-fragment infrastructure.
- Make `scripts/remote-bot-bundle.js` consume direct runtime entry modules.

Primary files:

- `src/browser/runtime-fragment-registry.js`
- `src/browser/runtime-source.js`
- `src/browser/runtime-entry-source.js`
- `scripts/remote-bot-bundle.js`
- `scripts/build-remote-bot.js`
- `scripts/build-remote-bot-bundled.js`
- `scripts/verify-objective-build.js`

Verification focus:

- No obsolete `src/browser/*source.js` fragment remains except any explicitly retained build adapter.
- Production and local eval builds share the same direct bundler entry.
- Final dist remains a single browser-safe file with no unresolved relative `require()` / `import`.
- Static verifier switches from source-string shape checks to module graph and generated-product checks.

## Completion Criteria

The migration is complete when all of these are true:

- `src/browser/runtime-fragment-registry.js` no longer orders source factories.
- `src/browser/runtime-source.js` no longer renders named source fragments.
- Production remote build and local eval build are both based on real bundler entry modules.
- Deleted source-generation files are rejected by `scripts/verify-objective-build.js`.
- Full validation passes:
  - `node grasp-rat-bot.js --self-test`
  - `node scripts/objective-status.js --self-test`
  - `node --check grasp-rat-bot.js`
  - `node --check scripts/build-remote-bot.js`
  - `node --check scripts/objective-status.js`
  - `node --check scripts/verify-objective-build.js`
  - `npm run test:runtime-helper-entry`
  - `npm run test:remote-bundled`
  - `cd combat-log-service && npm test`
  - `node scripts/build-remote-bot.js --version bootstrap-0.4.xxx`
  - `node scripts/verify-objective-build.js`

## Notes For Execution

- Prioritize structural completion over preserving small intermediate abstractions.
- Keep realtime/native-visible combat and ordinary profit priority rules intact.
- Use static verification to reject each deleted source-generation layer immediately.
- If a runtime issue appears after live testing, fix it forward on the direct-runtime structure instead of restoring the source-string layer.
