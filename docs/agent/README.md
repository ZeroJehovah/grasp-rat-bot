# Agent Reference Index

These files hold current project handoff context that is too large or too version-specific for `AGENTS.md`. They are tracked project documents and should be committed with normal code/docs changes when updated.

Read only what is needed for the current task:

- [current-architecture.md](current-architecture.md): canonical architecture guide for future work; use this before changing source layout, runtime ownership, or module boundaries.
- [current-state.md](current-state.md): latest remote version, manifest hash, release commit, and current handoff state.
- [data-model.md](data-model.md): game state, entity, coin, stamina, combat-log, and session data model notes.
- [strategy-summary.md](strategy-summary.md): current bot strategy behavior for combat, coins, movement, exits, recovery, and reporting.
- [measured-parameters.md](measured-parameters.md): measured game constants and empirical timing/range notes.
- [config-defaults.md](config-defaults.md): important runtime config defaults.
- [combat-logging.md](combat-logging.md): combat-log service, analyzer, daily summary, and live monitoring notes.
- [coin-balance-reporting.md](coin-balance-reporting.md): known-good Elysiver API method, auth variables, monthly coin report command, and fetch retry behavior.
- [test-coverage.md](test-coverage.md): current self-test/static/replay coverage notes and known validation gaps.
- [browserless-vps-migration.md](browserless-vps-migration.md): long-running browserless VPS runner migration goal, auth/WS findings, demo status, rollout plan, and VPS log handoff notes.
- [browserless-vps-observation.md](browserless-vps-observation.md): short live VPS observation handoff with known issues, fixes, current watch items, and latest Drop/stamina baseline.
- [browserless-runner-development-plan.md](browserless-runner-development-plan.md): commit-by-commit implementation plan for turning the headless demo into the production browserless VPS runner.
- [browserless-runner-operator.md](browserless-runner-operator.md): production browserless runner commands, status API, state file, and local log operation notes.
- [chase-mode-development-plan.md](chase-mode-development-plan.md): original implementation plan for chase mode; current durable behavior/config/model notes live in the current strategy, config, and data-model docs.
- [external-watchdog-plan.md](external-watchdog-plan.md): proposed out-of-page watchdog design for combat stalls, CDP observation, direct leave rescue, and Clash rescue.

## Current Development Surfaces

- `src/strategy/`: pure strategy cores and self-tests.
- `src/browser/runtime/`: browser runtime domain integration modules.
- `src/browser/runtime-entry.js`: the single browser runtime entry bundled by esbuild.
- `grasp-rat-bot.js`: Node/CDP fallback and local CLI wrapper.
- `userscript/` and `extension/`: script A/bootstrap surfaces.

## Maintenance Rules

- Treat [current-architecture.md](current-architecture.md) as the durable architecture rule set. Future changes should preserve its ownership boundaries unless a task explicitly changes the architecture and updates that document.
- Keep `AGENTS.md` version-independent. Do not move release history, current-version notes, or bulky handoff context back into it.
- Do not add new refactoring-process plans or migration logs unless there is an active refactoring task that truly needs them. When such a task closes, collapse durable outcomes back into current architecture/current state docs.
- When a task changes the remote bot version, manifest hash, latest release commit, release behavior, strategy behavior, config defaults, logging behavior, validation coverage, or live-validation target, update the corresponding file in this directory in the same task.
- For every remote bot release, update [current-state.md](current-state.md) with the new version, manifest hash, latest release commit, release note, and live-validation target.
- Commit and push these tracked docs with the related code/build changes by default.
