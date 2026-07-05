# Current State

Update this file for every remote bot release or handoff-relevant state change. Keep it current and concise; architecture rules live in [current-architecture.md](current-architecture.md).

## Latest Release

- Latest remote bot: `bootstrap-0.4.556`.
- Latest manifest SHA-256: `ed6bc81b902f4107e97dd10a11798b413741d41ebe53c930a9fed1438b61538a`.
- Latest remote release commit: `b3795fc` (`bootstrap-0.4.556` wire combat stamina budget).
- Latest bootstrap A versions: Tampermonkey `0.4.73`, extension `0.1.52`.
- Latest direct entry/config SHA-256: `770df148fd71ad0659acfc2defe1ee3a3f9489669f3a0842d260ff2b6fd5f716`.

## Current Handoff

- `bootstrap-0.4.556` passes `opportunityLongStaminaBudget` from the combat composition runtime into combat-target runtime; active-combat budget checks should no longer throw `opportunityLongStaminaBudget is not defined`.
- `bootstrap-0.4.555` restores the control-flow dependencies for `newExitAuditRequestId` and `syncPausedFromPage`; the control-flow runtime now instantiates cleanly with stub dependencies and should no longer fail with `newExitAuditRequestId is not defined`.
- `bootstrap-0.4.554` defers the control-flow `stopMotionAfterExit` dependency until native state initializes it; remote startup should no longer fail with `Cannot access 'stopMotionAfterExit' before initialization`.
- `bootstrap-0.4.553` restores the combat-log session boundary helpers that were dropped during the logging runtime split; remote startup should no longer fail with `startCombatLogSession is not defined`.
- The runtime refactoring result is accepted as complete.
- The old refactoring-process documents and migration plans have been removed from tracked docs.
- The durable architecture guidance is now [current-architecture.md](current-architecture.md).
- Future source changes should follow the current architecture: pure strategy in `src/strategy/`, browser runtime domain ownership in `src/browser/runtime/`, a thin `src/browser/runtime-entry.js`, and script A/bootstrap changes in `userscript/` plus `extension/`.
- `AGENTS.md` remains the local standing-rule entrypoint and points to `docs/agent/README.md`; tracked architecture detail belongs in `docs/agent/current-architecture.md`.

## Current Architecture Facts

- `src/browser/runtime-entry.js` is the single browser runtime entry bundled by esbuild.
- The old browser source-string layer is gone and must stay gone: no `src/browser/*source.js`, `runtime-source.js`, `runtime-entry-source.js`, or `runtime-fragment-registry.js`.
- `src/browser/runtime/` contains 88 executable browser runtime modules in the esbuild graph.
- Orchestration runtime factories use named domain contexts instead of the former wide flat dependency bag.
- `control-flow-runtime.js` is a composition owner; session recovery and relogin gate behavior have dedicated modules.
- `grasp-rat-bot.js` is the Node/CDP fallback and local CLI wrapper, not the normal home for strategy or browser-runtime changes.

## Latest Validation Baseline

The latest `bootstrap-0.4.556` release validation passed:

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
node scripts/build-remote-bot.js --version bootstrap-0.4.556
node scripts/verify-objective-build.js
git diff --check
```

Latest objective build verification reports 34 checks and guards:

- manifest/dist/source hash consistency;
- direct runtime-entry bundling for production and local CDP/print-source;
- absence of obsolete source-fragment files;
- ownership boundaries for shell, API, entity, UI, logging, control, native, profit, combat, and orchestration modules;
- runtime module graph coverage for all browser runtime modules;
- module size budgets;
- dependency-width budgets for high-risk composition factories;
- native/realtime-only combat target/aim/fire anchors;
- visible/native ordinary-profit priority before snapshot fallback;
- userscript and extension bootstrap version consistency.

## Report Locations

- Daily reports: `docs/reports/YYYY-MM/daily-YYYY-MM-DD.md`.
- Monthly Elysiver coin balance reports: `docs/reports/YYYY-MM/monthly-YYYY-MM.md`.
- Combat logs and temporary detailed JSONL remain under `combat-log-service/logs/` and are not the durable report location.
