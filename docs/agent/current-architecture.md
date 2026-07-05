# Current Architecture

This document is the canonical architecture guide for future work. It replaces the old refactoring plans and migration notes: those documents described how the project reached the current layout, but they are no longer the guidance for new changes.

## Refactor Result

The refactoring round is accepted as complete.

- Direction: correct.
- Completion: complete for the current runtime architecture round.
- Result compared with the old monolithic source: clearly improved.

The important result is not just smaller files. The project now has explicit ownership boundaries, a single direct browser runtime entry, pure strategy modules with tests, domain runtime modules, and static verifier guards that stop the old monolith and wide dependency relays from returning unnoticed.

## Source Layout

- `userscript/`: Tampermonkey script A/bootstrap surface.
- `extension/`: Chrome extension script A/bootstrap surface.
- `dist/`: generated script B and manifest. Do not edit generated files by hand.
- `scripts/`: build, verification, report, and local tooling.
- `src/strategy/`: pure strategy cores and self-tests.
- `src/browser/runtime-entry.js`: the single browser runtime entry bundled by esbuild.
- `src/browser/runtime/`: browser runtime domain modules.
- `src/node/`: Node-only local CLI and self-test support.
- `src/shared/`: small helpers shared by Node, strategy, and browser wrappers.
- `combat-log-service/`: local log collector, analyzer, daily summary, and replay tooling.
- `docs/agent/`: current handoff, architecture, data model, strategy, config, logging, and validation notes.

## Runtime Boundaries

`src/browser/runtime-entry.js` is a composition entry. It may create shell state, build domain runtimes, assemble domain contexts, install the bot API, and start the runtime. It must not regain domain decision bodies.

Runtime domain modules under `src/browser/runtime/` own browser integration:

- Shell/state/API: `runtime-shell.js`, `runtime-state-bindings.js`, `runtime-bot-state.js`, `bot-api-runtime.js`.
- Context shape: `runtime-domain-contexts.js`.
- Entity/UI glue: `entity-state-runtime.js`, `status-panel.js`, `target-overlay.js`, `target-whitelist.js`.
- Native/page integration: `native-data-runtime.js`, `native-transport-runtime.js`, `native-state-runtime.js`, `session-stats-runtime.js`, `stall-diagnostics-runtime.js`, `network-quality-runtime.js`.
- Control flow: `control-flow-runtime.js`, `control-login-runtime.js`, `login-point-safety-runtime.js`, `post-login-zoom-runtime.js`, `pending-exit-runtime.js`, `clash-leave-rescue-runtime.js`, `leave-flow-runtime.js`, `session-recovery-runtime.js`, `relogin-gate-runtime.js`.
- Profit: `profit-runtime.js`, `profit-coin-runtime.js`, `profit-opportunity-runtime.js`, `profit-post-attack-runtime.js`, `profit-arbitration-runtime.js`.
- Combat: `combat-runtime.js`, `combat-target-runtime.js`, `combat-movement-runtime.js`, `combat-aim-runtime.js`, `combat-action-runtime.js`.
- Logging: `combat-log-runtime.js`, `combat-log-queue-runtime.js`, `combat-log-frame-runtime.js`, `combat-log-diagnostics-runtime.js`, `exit-audit-runtime.js`, `important-session-runtime.js`, `kill-attribution-runtime.js`.
- Orchestration: `orchestration-runtime.js`, `orchestration-safety-runtime.js`, `orchestration-decision-runtime.js`, `orchestration-tick-runtime.js`.

Composition modules wire narrower owners. They should stay small enough that a reviewer can see which owner handles each behavior.

## Strategy Boundaries

`src/strategy/` owns browser-independent policy and scoring logic. Put logic here when it can be expressed as pure functions over explicit inputs and verified without page state.

Current strategy surfaces include:

- action priority and final action arbitration;
- target-switch diagnostics;
- coin diagnostics, target identity, progress, motion, and routing;
- opportunity candidate, choice, pick, and clear helpers;
- post-attack drop selection;
- stamina-budget helpers;
- combat constants, target selection, movement, and fire-discipline helpers;
- focused self-tests in `src/strategy/self-test.js`.

Browser runtimes may adapt page state into strategy inputs and apply returned decisions, but strategy modules should not read globals, mutate `bot`, use DOM APIs, or depend on browser transport.

## Dependency Shape

The runtime must avoid returning to one flat dependency bag.

- Use `createRuntimeDomainContexts()` to pass named context groups across orchestration boundaries.
- Keep wide compatibility maps local to composition code only when needed.
- New runtime factories should accept a small explicit dependency object or named contexts, not hundreds of flat fields.
- If a module starts forwarding most of the runtime, split ownership or add a narrower domain context.

The verifier currently guards high-risk widths for orchestration and control-flow factories. Treat those budgets as architectural constraints, not incidental tests.

## Build Shape

The browser runtime is bundled directly from `src/browser/runtime-entry.js` through esbuild. Do not restore source-string factories, fragment registries, generated-source materializers, or wrapper layers that exist only to assemble JavaScript strings.

The obsolete architecture remains forbidden:

- no top-level `src/browser/*source.js` source-fragment layer;
- no `src/browser/runtime-source.js`;
- no `src/browser/runtime-entry-source.js`;
- no `src/browser/runtime-fragment-registry.js`;
- no direct domain bodies added back to `runtime-entry.js`;
- no strategy or browser runtime behavior added to `grasp-rat-bot.js` unless it is Node/CDP fallback behavior.

## Change Rules

Choose the owner before editing:

- Pure policy or scoring: `src/strategy/`.
- Browser page/native integration: the relevant `src/browser/runtime/*-runtime.js` owner.
- Runtime assembly only: `src/browser/runtime-entry.js` or a composition runtime.
- Bootstrap/panel injection: `userscript/` and `extension/`.
- Reports/log analysis: `combat-log-service/` and `docs/reports/`.

Keep structural changes separate from strategy tuning. Combat changes driven by battle records still require offline replay validation. Profit and combat rules must keep the standing constraints from `AGENTS.md`: combat target/aim/fire use native/realtime visible state only, and ordinary profit prefers visible/native coins and visible/native AFK targets before snapshot fallback.

## Verification

For runtime or strategy changes, run the validation surface appropriate to the change. The usual release gate is:

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

Also run `npm run test:runtime-helper-entry` and `npm run test:remote-bundled` when the direct runtime entry, bundler, runtime helper entry, or generated script B path is touched.

For documentation-only changes, run at least:

```bash
git diff --check
```

## Documentation Policy

Keep docs current-state focused. Do not recreate long refactoring-process documents unless there is a new active refactoring plan. The durable handoff for architecture is this file plus:

- `docs/agent/current-state.md` for latest release state;
- `docs/agent/strategy-summary.md` for behavior;
- `docs/agent/data-model.md` for runtime/log/report data;
- `docs/agent/test-coverage.md` for validation coverage;
- `docs/agent/config-defaults.md` for runtime defaults.
