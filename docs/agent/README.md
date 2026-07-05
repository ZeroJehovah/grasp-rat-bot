# Agent Reference Index

These files hold project handoff context that is too large or too version-specific for AGENTS.md. They are tracked project documents and should be committed with normal code/docs changes when updated.

Read only what is needed for the current task:

- [current-state.md](current-state.md): current remote version notes, release history, active live-validation targets, and recent handoff context.
- [data-model.md](data-model.md): game state, entity, coin, stamina, combat-log, and session data model notes.
- [strategy-summary.md](strategy-summary.md): current bot strategy behavior for combat, coins, movement, exits, recovery, and reporting.
- [measured-parameters.md](measured-parameters.md): measured game constants and empirical timing/range notes.
- [config-defaults.md](config-defaults.md): important runtime config defaults.
- [combat-logging.md](combat-logging.md): combat-log service, analyzer, daily summary, and live monitoring notes.
- [coin-balance-reporting.md](coin-balance-reporting.md): known-good Elysiver API method, auth variables, monthly coin report command, and fetch retry behavior.
- [test-coverage.md](test-coverage.md): current self-test/static/replay coverage notes and known validation gaps.
- [runtime-bundler-migration-plan-2026-07-05.md](runtime-bundler-migration-plan-2026-07-05.md): completed browser runtime bundler/source-fragment migration inventory and release-slice plan.
- [runtime-entry-domain-migration-plan-2026-07-05.md](runtime-entry-domain-migration-plan-2026-07-05.md): completed direct runtime entry decomposition inventory and release-slice plan.
- [remaining-runtime-migration-plan-2026-07-05.md](remaining-runtime-migration-plan-2026-07-05.md): current post-migration cleanup inventory and 10-commit implementation plan.

## Maintenance Rules

- Keep `AGENTS.md` version-independent. Do not move release history, current-version notes, or bulky handoff context back into it.
- When a task changes the remote bot version, manifest hash, latest release commit, release behavior, strategy behavior, config defaults, logging behavior, validation coverage, or live-validation target, update the corresponding file in this directory in the same task.
- For every remote bot release, update [current-state.md](current-state.md) with the new version, manifest hash, latest release commit, release note, and live-validation target.
- Commit and push these tracked docs with the related code/build changes by default.
