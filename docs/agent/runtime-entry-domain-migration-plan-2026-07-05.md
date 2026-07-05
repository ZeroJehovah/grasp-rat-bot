# Runtime Entry Domain Migration Plan - 2026-07-05

This plan starts from `main` after `bootstrap-0.4.524`.

The previous runtime bundler migration is complete: production and local injection now bundle the real esbuild entry `src/browser/runtime-entry.js` directly, and the old source-string layer is gone. The remaining migration is a second phase: split the 18k-line executable runtime entry into domain-owned browser modules while preserving the direct entry build shape.

## Current Inventory

- Source-string generation files remaining: 0.
- Obsolete runtime source layer remaining: 0 (`src/browser/*source.js`, `src/browser/runtime-fragment-registry.js`, `src/browser/runtime-source.js`, and `src/browser/runtime-entry-source.js` are absent).
- Direct browser entry still to decompose: `src/browser/runtime-entry.js`, 18,434 lines.
- Function declarations inside the direct entry: 672.
- Existing executable helper modules: 42 files under `src/browser/runtime/`.
- Current top-level browser files: `src/browser/page-global-core.js`, `src/browser/runtime-entry.js`, and `src/browser/runtime-helper-entry.mjs`.

## Migration Status

- [x] Runtime shell and context (`bootstrap-0.4.525`).
- [ ] UI, overlay, status, whitelist, and stamina.
- [ ] Logging and history.
- [ ] Login, exit, pending exit, and leave flow.
- [ ] Native state, transport, session stats, and network quality.
- [ ] Coin, opportunity, profit, and arbitration.
- [ ] Combat domain.
- [ ] Final orchestrator and verifier tightening.

## Remaining Migration Scope

The remaining work is structural, not a strategy rewrite.

- Keep `src/browser/runtime-entry.js` as the esbuild entry, but reduce it to startup composition and high-level orchestration.
- Move domain behavior into executable modules under `src/browser/runtime/` or a subdirectory such as `src/browser/runtime/domains/`.
- Keep the old source-string files deleted; do not restore source factories, fragment registries, or generated-source materializers as adapters.
- Preserve the production manifest mode and direct entry/config hash verification.
- Keep combat target, aim, and fire decisions based on native/realtime visible state only.
- Keep ordinary profit flow prioritizing realtime/native visible coins and visible/native AFK targets before snapshot fallback.
- Prefer mechanical extraction with stable behavior. If a slice exposes risky behavior coupling, split smaller rather than mixing refactor with strategy changes.

## Current Runtime Entry Regions

Approximate line ranges in `src/browser/runtime-entry.js`:

- Runtime shell use, shared bindings, `bot` methods, and base helpers: lines 1-475.
- Target whitelist, stamina, exit motion, target overlay, and status panel: lines 476-1632.
- Combat log, tick safety, reload/session controls, login gates, login-point safety, post-login zoom, and pause handling: lines 1633-5654.
- Page-native snapshot observer, pending exit, leave command, auto-login, and leave flow: lines 5655-7820.
- Native state/control, entity/coin/bullet normalization, session stats, and network quality: lines 7821-9490.
- Important logs, combat history, kill attribution, and entity refresh: lines 9491-10724.
- Native movement/shooting, motion helpers, return-block, classify, offline safety, and coin safety: lines 10725-12003.
- Target selection and combat movement/aim/state/fire/leave/action: lines 12004-15637.
- Opportunity, coin/profit action builders, action arbitration, coin tracking, `chooseAction`, `tick`, and startup tail: lines 15638-18434.

## Commit Plan

Plan count from current state: 7 future migration commits after the completed shell/context slice. The implementation commits should each be behavior-preserving unless explicitly called out and validated separately.

### 1. Runtime Shell And Context - Completed

Goal:

- Extract the runtime shell, context construction, shared config/default access, state bindings, and `bot` object setup.
- Keep initialization order explicit and testable.

Expected result:

- `runtime-entry.js` still owns the entrypoint, but the common runtime context is created by a module.
- No domain logic moves yet except state/bootstrap glue required by the shell boundary.

Validation focus:

- Runtime bootstrap defaults, preserved state, pending-exit persistence, and page-global adapters initialize in the same order.
- Direct esbuild entry and helper-entry tests still use the same config injection path.

Completed in `bootstrap-0.4.525`: `src/browser/runtime/runtime-shell.js` creates the bootstrap and runtime-state bindings, `src/browser/runtime/runtime-bot-state.js` owns the extracted initial `bot` state, and `scripts/verify-objective-build.js` checks the new shell/bot-state boundary.

### 2. UI, Overlay, Status, Whitelist, And Stamina

Goal:

- Move target whitelist polling/status, stamina summaries, target overlay rendering, and status panel rendering into UI/presentation modules.

Expected result:

- Visual/status behavior is owned by UI modules.
- Runtime entry no longer contains canvas overlay drawing or status text formatting bodies.

Validation focus:

- Status output, target overlay suppression after exit, login-point overlay state, whitelist status, and stamina display remain available through `bot.status()`.

### 3. Logging And History

Goal:

- Move combat log runtime, important-log store/remote flush, combat history, kill attribution, and tick error safety into logging modules.

Expected result:

- Combat-log service integration and important event persistence are isolated from decision logic.
- Session and active-player combat records keep the same fields used by daily reports.

Validation focus:

- `combat-log-service` tests pass.
- Daily-report dependencies remain intact: per-login stats and per-active-player-combat stats are still logged.

### 4. Login, Exit, Pending Exit, And Leave Flow

Goal:

- Move reload requests, session/no-self exit checks, login gate, login-point safety, post-login zoom, pending exit, leave command, auto-login, and leave-flow wrappers into control-flow modules.

Expected result:

- Exit/relogin decisions and leave retries are domain-owned instead of embedded in the entry.
- Pending-exit confirmation/retry persistence remains compatible with existing local storage keys.

Validation focus:

- Login gate summaries, relogin holds, 403 risk holds, pending combat leave, and Clash rescue retry behavior remain stable.

### 5. Native State, Transport, Session Stats, And Network Quality

Goal:

- Move native state/control access, realtime entity/coin/bullet normalization, page-native snapshot observer, movement/shoot transport, session stats, and network-quality tracking into native/runtime state modules.

Expected result:

- Runtime entry consumes normalized native state and transport APIs.
- Snapshot fallback boundaries stay explicit and do not leak into combat target/aim/fire decisions.

Validation focus:

- Native/realtime entity merge behavior, coin and bullet collection, session stamina accounting, network quality summaries, and movement/shot command side effects remain unchanged.

### 6. Coin, Opportunity, Profit, And Arbitration

Goal:

- Move coin safety, coin motion/target/progress glue, opportunity scoring, opportunity candidate/choice/action builders, post-attack drop waits, and final action arbitration into profit modules.

Expected result:

- Ordinary profit selection can be reviewed independently from survival and combat bands.
- Existing target-stick and switch-hysteresis behavior stays centralized.

Validation focus:

- Visible/native coin and AFK priority remains ahead of snapshot fallback.
- Final arbitration continues to keep survival bands separate from ordinary coin-per-stamina scoring.

### 7. Combat Domain

Goal:

- Move target selection, combat movement, aim, state, shooting plan, leave cover, and combat action building into combat modules.

Expected result:

- Combat logic becomes a domain module called from orchestration instead of inline entry code.
- No opponent-specific tuning is included in this structural commit.

Validation focus:

- Combat target, aim, and fire logic still uses native/realtime visible state only.
- Existing replay self-tests pass. If this slice touches behavior due to unavoidable coupling, run the referenced offline replay and prove an improvement before shipping.

### 8. Final Orchestrator And Verifier Tightening

Goal:

- Split `chooseAction`, `tick`, and startup tail into small orchestration modules.
- Reduce `runtime-entry.js` to a thin entry that builds context, wires domains, starts the bot, and exports the startup promise.
- Strengthen `scripts/verify-objective-build.js` so the monolith cannot grow back unnoticed.

Expected result:

- The direct entry build remains the only runtime build path.
- `runtime-entry.js` no longer contains large inline domain blocks.

Validation focus:

- Verifier checks direct entry graph, final dist, absent source-string layer, domain boundary anchors, native/realtime combat anchors, and visible/native profit priority anchors.

## Validation Baseline Per Implementation Commit

Run the full release validation for code/build changes unless the slice is clearly documentation-only:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/build-remote-bot.js
node --check scripts/objective-status.js
node --check scripts/verify-objective-build.js
cd combat-log-service && npm test
node scripts/build-remote-bot.js --version bootstrap-0.4.xx
node scripts/verify-objective-build.js
```

Additional checks by slice:

- UI/status slices: inspect generated status/overlay anchors in the built dist.
- Logging slices: run `combat-log-service` tests and confirm daily-report log fields remain compatible.
- Combat slices: run replay self-tests; run a referenced battle replay if behavior changes or the extraction was driven by a battle record.
- Final verifier slice: verify that removed source-string files are still absent and that `runtime-entry.js` is enforced as a thin composition entry.

For documentation-only changes, run at least:

```bash
git diff --check
```

## Completion Criteria

- `src/browser/runtime-entry.js` is a small composition entry, not an 18k-line domain implementation file.
- Browser runtime behavior is owned by executable modules.
- The old source-string generation layer remains absent.
- Production/local builds still use direct esbuild entry bundling.
- Static verification prevents accidental restoration of source factories or large inline domain blocks.
- Strategy behavior, especially combat visibility rules and profit priority rules, is unchanged unless a separate behavior commit explicitly validates the change.
