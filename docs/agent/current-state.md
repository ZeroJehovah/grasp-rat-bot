# Current State

Update this file for every remote bot release or handoff-relevant state change. Keep it current and concise; architecture rules live in [current-architecture.md](current-architecture.md).

## Latest Release

- Latest remote bot: `bootstrap-0.4.564`.
- Latest manifest SHA-256: `63a65abbdbc8f1d5237132e639baa310f9a28060146fd0785f38a6d7b4942289`.
- Latest remote release commit: `bcca0c9` (`bootstrap-0.4.564` use close passive-runner live precision).
- Latest bootstrap A versions: Tampermonkey `0.4.74`, extension `0.1.53`.
- Latest direct entry/config SHA-256: `55caa34d5bec1c746d0d8eb4703f1dabc183b7e20416e1f11fc79832ce3310fc`.

## Current Handoff

- `bootstrap-0.4.564` changes confirmed passive coin-runner aiming inside `combatPassiveRunnerPrecisionRange = 5500cm` from full intercept lead to live/native/render precision. Recent `xuanze00` replays showed the old close intercept overled small zigzag movement; the new generic passive-runner branch improved estimated hits from `29/229` to `86/229` and from `19/143` to `67/143` on two records, while `colloq168` active-pressure replays stayed effectively unchanged.
- `bootstrap-0.4.563` preserves healthy high-value visible coin pickup after a same-tick minor injury instead of escalating the generic `injury hp drop` fallback to `leave()`, while keeping low-HP/combat-disadvantage exits intact. Injury leave summaries now prefer an explicit bullet owner or closer real human over a farther/invulnerable Active summary, so the displayed attacker should match the nearby player that caused the HP drop.
- `bootstrap-0.4.562` passes `directionTo` into combat movement runtime and `now` into combat target runtime, with objective-build smoke coverage for passive-runner close movement and sticky combat target selection; the checked browser runtime surface has no unexpected `no-undef` findings beyond known build/page globals.
- `bootstrap-0.4.561` passes `combatTargetId` into combat movement runtime and adds an objective-build passive-runner smoke for the dependency; passive-runner combat checks should no longer throw `combatTargetId is not defined` when combat starts.
- `bootstrap-0.4.560` passes `isInvulnerable` into combat movement runtime and adds objective-build guards for the dependency; passive-runner combat checks should no longer throw `isInvulnerable is not defined` when combat starts.
- `bootstrap-0.4.559` passes `speed` into combat movement runtime and `isJoinModeActive` into combat target runtime, with objective-build guards for both dependencies; active-combat checks should no longer throw `speed is not defined` or `isJoinModeActive is not defined`.
- `bootstrap-0.4.558` passes `dropValue` into the combat movement runtime and adds objective-build guards for the dependency; passive-runner combat checks should no longer throw `dropValue is not defined`.
- Bootstrap A Tampermonkey `0.4.74` and extension `0.1.53` now evaluate the local login-point safety gate only after `maybeStartGameLogin()` confirms that an automatic login is actually needed; watchdog intervals should no longer print `login blocked by local login-point safety gate` while an alive in-game self is active.
- `bootstrap-0.4.557` passes `highValueCoinPriorityAmount` into the profit opportunity runtime and adds an objective-build smoke for `opportunityChoiceCoreOptions()`; missing-held opportunity checks should no longer throw `highValueCoinPriorityAmount is not defined`.
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

The latest `bootstrap-0.4.564` release validation passed:

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
cd combat-log-service && npm run replay -- --file logs/2026-07-06/combat/20260705171540-self-28886-vs-xuanze00.jsonl --start-line 96 --end-line 2316 --self-id 28886 --target-id 34711 --target-name xuanze00
cd combat-log-service && npm run replay -- --file logs/2026-07-06/combat/20260705160246-self-28886-vs-xuanze00.jsonl --start-line 1 --end-line 1734 --self-id 28886 --target-id 34711 --target-name xuanze00
cd combat-log-service && npm run replay -- --file logs/2026-07-06/combat/20260705165650-self-28886-vs-colloq168.jsonl --start-line 1 --end-line 1006 --self-id 28886 --target-id 34683 --target-name colloq168
cd combat-log-service && npm run replay -- --file logs/2026-07-06/combat/20260705164449-self-28886-vs-colloq168.jsonl --start-line 1 --end-line 1439 --self-id 28886 --target-id 34683 --target-name colloq168
npm run test:runtime-helper-entry
npm run test:remote-bundled
node scripts/build-remote-bot.js --version bootstrap-0.4.564
node scripts/verify-objective-build.js
git diff --check
```

Latest objective build verification reports 35 checks and guards:

- manifest/dist/source hash consistency;
- direct runtime-entry bundling for production and local CDP/print-source;
- absence of obsolete source-fragment files;
- ownership boundaries for shell, API, entity, UI, logging, control, native, profit, combat, and orchestration modules;
- runtime module graph coverage for all browser runtime modules;
- module size budgets;
- dependency-width budgets for high-risk composition factories;
- native/realtime-only combat target/aim/fire anchors;
- visible/native ordinary-profit priority before snapshot fallback;
- bootstrap auto-login evaluates login-point safety only after login is needed;
- userscript and extension bootstrap version consistency.

## Report Locations

- Daily reports: `docs/reports/YYYY-MM/daily-YYYY-MM-DD.md`.
- Monthly Elysiver coin balance reports: `docs/reports/YYYY-MM/monthly-YYYY-MM.md`.
- Combat logs and temporary detailed JSONL remain under `combat-log-service/logs/` and are not the durable report location.
