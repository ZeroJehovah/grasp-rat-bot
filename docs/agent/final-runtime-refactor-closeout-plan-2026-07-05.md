# Final Runtime Refactor Closeout Plan - 2026-07-05

This document is the final closeout plan for the current refactoring round. It starts from `main` after `bootstrap-0.4.546` and the post-`bootstrap-0.4.542` migration closeout.

The goal is not to keep splitting files indefinitely. The goal is to end this refactoring round with durable module boundaries, explicit dependency shape, and verifier guards that prevent the old monolith or the recent wide-composition pattern from growing back unnoticed.

## Current Baseline

- Latest remote bot: `bootstrap-0.4.546`.
- Git baseline at planning time: `main` / `origin/main` clean after `e673ea9` (`docs: close runtime migration handoff`).
- Old browser source-string layer: removed and guarded.
- Production/local runtime build path: esbuild bundles the real entry `src/browser/runtime-entry.js`.
- Runtime module graph: 85 executable modules under `src/browser/runtime/*.js`.
- `src/browser/runtime-entry.js`: about 2,140 lines, now an executable composition entry.
- `src/browser/runtime/orchestration-runtime.js`: about 326 lines, but still forwards a very wide dependency object.
- `src/browser/runtime/orchestration-decision-runtime.js`: about 1,133 lines and roughly 239 injected runtime fields.
- `src/browser/runtime/orchestration-tick-runtime.js`: about 1,245 lines and roughly 223 injected runtime fields.
- `src/browser/runtime/control-flow-runtime.js`: about 1,615 lines and roughly 133 injected runtime fields.
- `scripts/verify-objective-build.js`: 32 checks, including direct entry, source-string absence, module graph, owner anchors, and line budgets.

## Final Definition Of Done

This round is complete only when all of the following are true:

- `runtime-entry.js` remains the only browser runtime entry and does not regain domain logic.
- The old `src/browser/*source.js`, `runtime-source.js`, `runtime-entry-source.js`, and `runtime-fragment-registry.js` style does not return.
- Orchestration modules no longer depend on 200+ flat injected names.
- The remaining control-flow composition layer is split enough that login/recovery/relogin owners are obvious.
- Verifier checks cover both module size and dependency width for the final high-risk composition points.
- README and agent docs describe the current `src/strategy` and `src/browser/runtime` layout instead of the old `grasp-rat-bot.js`-centric layout.
- No combat strategy tuning is mixed into structural commits. If unavoidable behavior changes appear, run the required combat replay validation before release.

## Commit Plan

Plan count: 8 commits.

Only commits 3 through 8 are expected to touch runtime code. Commit 1 is documentation-only. Commit 2 is verifier-only. Commit 8 is the release and documentation closeout. If each code commit is released, versions can start at `bootstrap-0.4.547` and advance sequentially; the actual version should follow the branch state when implemented.

### Commit 1 - Add Final Closeout Plan

Purpose:

- Record this final refactoring plan as tracked handoff context.
- Make the plan discoverable from the agent docs index.

Expected files:

- `docs/agent/final-runtime-refactor-closeout-plan-2026-07-05.md`
- `docs/agent/README.md`

Implementation notes:

- Do not change runtime code in this commit.
- Do not publish a new remote bot version.

Validation:

```bash
git diff --check
```

Completion criteria:

- The plan lists all remaining commits and their validation expectations.
- Agent docs index points to the new plan.

### Commit 2 - Add Dependency Width Guards

Purpose:

- Convert the current "wide dependency injection" concern into an objective verifier signal.
- Establish temporary budgets before changing runtime wiring.

Expected files:

- `scripts/verify-objective-build.js`
- `docs/agent/test-coverage.md`
- `docs/agent/current-state.md`

Implementation notes:

- Add helper logic that detects runtime factory destructuring width for selected modules.
- Track at least these factories:
  - `createOrchestrationRuntime()`
  - `createOrchestrationDecisionRuntime()`
  - `createOrchestrationTickRuntime()`
  - `createControlFlowRuntime()`
- Initial budgets should be close to current values so the first guard commit is non-disruptive.
- Keep existing line-budget checks and owner-anchor checks unchanged.

Validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check scripts/verify-objective-build.js
node scripts/verify-objective-build.js
```

Completion criteria:

- Verifier reports dependency-width details for high-risk runtime factories.
- Future dependency-width reduction can be enforced by tightening budgets.

### Commit 3 - Introduce Runtime Domain Contexts

Purpose:

- Stop treating the whole browser runtime as one flat dependency bag.
- Create named domain contexts without changing behavior.

Expected files:

- `src/browser/runtime-entry.js`
- New `src/browser/runtime/runtime-domain-contexts.js`
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `dist/grasp-rat-remote-bot.js`
- `dist/manifest.json`

Suggested domain contexts:

- `bootstrap`: constants, page-global helpers, runtime config, storage keys.
- `state`: `bot`, preserved state, persistent state helpers.
- `entity`: distance/math, HP, stamina, activity, invulnerability, AFK/profit predicates.
- `native`: native entity/coin/bullet/state access, movement/shoot transport, network quality.
- `control`: login, pending exit, leave flow, relogin, session mismatch, recovery gates.
- `profit`: coin picking, opportunity scoring, post-attack drop, final profit arbitration.
- `combat`: target selection, combat movement, aim, action building.
- `logging`: combat logs, important sessions, kill attribution, diagnostics.
- `ui`: status panel, overlay, whitelist status, display helpers.

Implementation notes:

- Build contexts after the existing domain factories are created.
- Keep compatibility with current flat runtime fields for this commit.
- Do not migrate orchestration consumers yet.
- Add verifier anchors for `createRuntimeDomainContexts()`.

Validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/build-remote-bot.js
node --check scripts/objective-status.js
node --check scripts/verify-objective-build.js
cd combat-log-service && npm test
node scripts/build-remote-bot.js --version bootstrap-0.4.547
node scripts/verify-objective-build.js
npm run test:runtime-helper-entry
npm run test:remote-bundled
```

Completion criteria:

- Runtime behavior remains structurally equivalent.
- Domain contexts enter the esbuild graph.
- `runtime-entry.js` still passes its size budget.

### Commit 4 - Move Orchestration Composition To Domain Contexts

Purpose:

- Make `createOrchestrationRuntime()` a true composition module instead of a flat dependency relay.

Expected files:

- `src/browser/runtime-entry.js`
- `src/browser/runtime/orchestration-runtime.js`
- `src/browser/runtime/runtime-domain-contexts.js`
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `dist/grasp-rat-remote-bot.js`
- `dist/manifest.json`

Implementation notes:

- Change `createOrchestrationRuntime()` to receive named contexts.
- Keep `createOrchestrationSafetyRuntime()`, `createOrchestrationDecisionRuntime()`, and `createOrchestrationTickRuntime()` behavior unchanged.
- Orchestration composition may still flatten selected context fields for child modules in this commit.
- Tighten the dependency-width budget for `orchestration-runtime.js` substantially.

Validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/verify-objective-build.js
node scripts/build-remote-bot.js --version bootstrap-0.4.548
node scripts/verify-objective-build.js
```

Completion criteria:

- `orchestration-runtime.js` no longer destructures hundreds of flat fields.
- Safety, decision, and tick outputs remain wired exactly as before.

### Commit 5 - Move Orchestration Decision To Domain Contexts

Purpose:

- Reduce the widest current dependency surface: `createOrchestrationDecisionRuntime()`.

Expected files:

- `src/browser/runtime/orchestration-runtime.js`
- `src/browser/runtime/orchestration-decision-runtime.js`
- `src/browser/runtime/runtime-domain-contexts.js`
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `dist/grasp-rat-remote-bot.js`
- `dist/manifest.json`

Suggested grouping inside decision runtime:

- `decisionState`: `bot`, config, decision-local state helpers.
- `safetyApi`: offline safety, server/action settlement stall, return-block helpers.
- `combatApi`: target picking, combat action, active-combat wait, opportunistic shot helpers.
- `profitApi`: coin actions, opportunity scoring, post-attack wait, profit arbitration.
- `nativeApi`: entity/coin/bullet lists, snapshot freshness, native metadata.
- `controlApi`: pending exit, relogin gates, leave actions, session mismatch recovery.
- `loggingApi`: combat tick logging, important combat/session logging, diagnostics.
- `uiApi`: status updates and display formatting.

Implementation notes:

- Preserve `classify()` and `chooseAction()` behavior.
- Avoid changing thresholds, priority ordering, target selection, or stamina scoring.
- Prefer local aliases near the top of the module if that keeps the body readable.
- Move ordinary visible/native-before-snapshot verifier anchors only if code ownership changes.
- Tighten the dependency-width budget for decision runtime after migration.

Validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/verify-objective-build.js
cd combat-log-service && npm test
node scripts/build-remote-bot.js --version bootstrap-0.4.549
node scripts/verify-objective-build.js
```

Completion criteria:

- Decision runtime no longer receives a 200+ field flat object.
- Profit priority and combat native/realtime-only constraints remain verified.

### Commit 6 - Move Orchestration Tick And Startup To Domain Contexts

Purpose:

- Reduce tick/startup dependency width and separate startup-only dependencies from per-tick dependencies.

Expected files:

- `src/browser/runtime/orchestration-runtime.js`
- `src/browser/runtime/orchestration-tick-runtime.js`
- `src/browser/runtime/runtime-domain-contexts.js`
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `dist/grasp-rat-remote-bot.js`
- `dist/manifest.json`

Suggested grouping inside tick runtime:

- `tickLifecycle`: reentry guard, safe callback wrappers, timer install, startup error handling.
- `tickState`: `bot`, config, pause/status helpers.
- `nativeTick`: refresh state, native tick trigger, movement stop, control summaries.
- `controlTick`: pending exit, login/relogin gates, auto-login, recovery/reload.
- `decisionTick`: classify and choose action.
- `loggingTick`: combat log frame, important combat tick, runtime diagnostics.
- `uiTick`: panel/overlay refresh.

Implementation notes:

- Preserve `tick()` and `startRuntime()` externally visible behavior.
- Keep startup installation order stable: restore logs/state, install page global, start polling/timers, run initial tick.
- Tighten the dependency-width budget for tick runtime after migration.

Validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/verify-objective-build.js
npm run test:runtime-helper-entry
npm run test:remote-bundled
node scripts/build-remote-bot.js --version bootstrap-0.4.550
node scripts/verify-objective-build.js
```

Completion criteria:

- Tick runtime dependency width is materially lower.
- Local CDP/eval and production bundled runtime both still use the direct entry path.

### Commit 7 - Split Remaining Control-Flow Owners

Purpose:

- Remove the last obvious large control-flow composition debt.
- Give session recovery and relogin gate behavior explicit owners.

Expected files:

- `src/browser/runtime/control-flow-runtime.js`
- New `src/browser/runtime/session-recovery-runtime.js`
- New `src/browser/runtime/relogin-gate-runtime.js`
- `src/browser/runtime/runtime-domain-contexts.js` if context wiring changes
- `scripts/verify-objective-build.js`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `dist/grasp-rat-remote-bot.js`
- `dist/manifest.json`

Suggested ownership:

- `session-recovery-runtime.js`
  - Cloudflare/page reload request helpers.
  - session mismatch recovery.
  - no-self game-session exit state.
  - controlled recovery reload checks.
  - live-session takeover state.
- `relogin-gate-runtime.js`
  - login suppress reads/writes.
  - relogin hold summaries.
  - enemy/offline leave hold state integration.
  - safe/unsafe relogin gate status summaries.
  - stale hold cleanup.

Implementation notes:

- Keep `control-flow-runtime.js` as the composition layer for login, post-login zoom, login-point safety, pending exit, Clash leave rescue, leave flow, session recovery, and relogin gate.
- Do not change exit or relogin timing.
- Add verifier owner anchors for the new modules.
- Tighten the `control-flow-runtime.js` line budget and dependency-width budget.

Validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/verify-objective-build.js
cd combat-log-service && npm test
node scripts/build-remote-bot.js --version bootstrap-0.4.551
node scripts/verify-objective-build.js
```

Completion criteria:

- `control-flow-runtime.js` is clearly a control composition module.
- Session recovery and relogin gate logic have dedicated owners and verifier anchors.

### Commit 8 - Final Documentation, Budgets, And Release Closeout

Purpose:

- End the refactoring round formally.
- Update public and agent-facing documentation to match the final structure.
- Make verifier budgets represent the final expected state instead of temporary migration values.

Expected files:

- `README.md`
- `docs/agent/README.md`
- `docs/agent/current-state.md`
- `docs/agent/test-coverage.md`
- `docs/agent/final-runtime-refactor-closeout-plan-2026-07-05.md`
- `scripts/verify-objective-build.js`
- `dist/grasp-rat-remote-bot.js`
- `dist/manifest.json`

Implementation notes:

- Update README guidance that still says strategy changes happen in `grasp-rat-bot.js`.
- Describe the current development surfaces:
  - `src/strategy/` for pure strategy cores and self-tests.
  - `src/browser/runtime/` for browser runtime domain integration.
  - `grasp-rat-bot.js` for CDP fallback and local CLI.
  - `userscript/` and `extension/` for script A/bootstrap changes.
- Mark this plan complete.
- Update final line and dependency-width budgets.
- Record final release version, manifest SHA-256, release commit, and validation in `current-state.md`.

Final validation:

```bash
node grasp-rat-bot.js --self-test
node scripts/objective-status.js --self-test
node --check grasp-rat-bot.js
node --check scripts/build-remote-bot.js
node --check scripts/objective-status.js
node --check scripts/verify-objective-build.js
node --check userscript/grasp-rat-bootstrap.user.js
node --check extension/background.js
node --check extension/content-bridge.js
node --check extension/page-bootstrap.js
node --check extension/popup.js
cd combat-log-service && npm test
npm run test:runtime-helper-entry
npm run test:remote-bundled
node scripts/build-remote-bot.js --version bootstrap-0.4.552
node scripts/verify-objective-build.js
git diff --check
```

Completion criteria:

- The refactoring round is documented as complete.
- The verifier blocks old source-string recovery, entry/domain backflow, large composition-module growth, and wide dependency regression.
- There is no remaining migration plan item that must be completed before normal feature work resumes.

## Work Not Included In This Round

These items are intentionally excluded from the final closeout unless a concrete bug or live record requires them:

- Combat target/movement/aim behavior optimization.
- Further splitting `combat-target-runtime.js`, `combat-movement-runtime.js`, or `combat-aim-runtime.js` purely for line count.
- Target overlay refactor without a UI change requirement.
- New build framework migration away from the current esbuild setup.
- TypeScript migration.
- Package manager or repository layout churn.

## Implementation Rules For This Plan

- Keep each commit structural and narrow.
- Rebuild `dist/` for every runtime code release.
- Update agent docs in the same commit as relevant runtime/build changes.
- Do not change combat thresholds, target scoring, stamina policy, or relogin timing as part of dependency-shape work.
- If a structural change unexpectedly changes combat behavior, run the referenced offline replay before release or revert the behavior change.
- Keep `AGENTS.md` local-only unless explicitly requested.
