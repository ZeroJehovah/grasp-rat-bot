# Browserless Runner Development Plan

This is the commit-by-commit plan for turning the verified `headless-demo/` probe into a smaller production browserless VPS runner. It is not a full clone of the browser userscript. The product should keep the parts that matter for unattended VPS operation and intentionally drop browser-only support systems that are no longer needed.

The durable protocol findings remain in `docs/agent/browserless-vps-migration.md`. This file owns the implementation sequence.

## Product Target

Build a VPS-side Node runner that operates without a local browser by using direct game auth/session data, pre-login safety snapshots, WebSocket state frames, text control commands, local logs, a web status/control panel, and verified HTTP `leave`.

The finished runner should:

- persist and reuse a manually authorized token;
- perform login-point safety checks before unattended join/rejoin;
- connect directly to `wss://grasp-rat-game.h-e.top/ws`;
- parse `GRZ1` gzip JSON frames;
- maintain realtime visible state from `pos` frames;
- use pushed `snapshot` data only for pre-login safety and non-combat fallback flows;
- reuse existing `src/strategy/` pure policy where practical;
- send movement, shooting, and leave commands through a narrow transport adapter;
- store local logs for 3 days for strategy review;
- expose a web panel roughly equivalent to the current script panel, with clearer VPS-oriented wording;
- run as a real `systemd` service in production, not through `headless-demo/start-demo.sh`;
- exit safely on no-self, frame gaps, command stalls, stamina exhaustion, unsafe login point, explicit stop, or confirmed risk;
- support dry-run/canary modes before unattended live control.

## Simplified Scope

The browserless runner should not carry these browser-script systems forward:

- No external `combat-log-service` dependency for normal operation.
- No external watchdog. The runner owns its own process loop, frame-gap detection, and stop/leave path.
- No Clash proxy switching for leave rescue. If direct verified leave fails, the runner alerts and stops further control attempts.
- No chase mode. The unattended VPS mode should not expose manual target marking or chase-panel behavior.
- No browser bootstrap, extension, userscript, DOM overlay, minimap, or CDP dependency.

## Storage Choice

Use local JSONL files first, not SQLite.

Reasons:

- Append-only JSONL matches the current demo logs and is easy to inspect with `tail`, `jq`, `rg`, or small Node scripts.
- It avoids native SQLite package/build issues on the VPS.
- Three-day retention is simple and reliable with daily files plus startup cleanup.
- Strategy analysis can start from streaming parsers and daily summaries; SQLite can be added later only if real query needs justify it.

Planned layout:

```text
data/
  state.json
  logs/
    YYYY-MM-DD/
      runner.jsonl
      decisions.jsonl
      combat.jsonl
      exits.jsonl
      summary.json
```

Retention: delete day directories older than 3 UTC days at startup and once per day while running.

## Non-Negotiable Constraints

- Combat target, aim, and fire decisions must use realtime/native visible state from `pos`; snapshot data is not combat authority.
- Ordinary profit should prefer realtime/native visible coins and visible/native AFK targets. Current WS evidence shows coin drops only in pushed `snapshot`, so snapshot coins are allowed only as guarded non-combat fallback when realtime profit is absent.
- Before unattended join/rejoin, login-point safety must pass. If direct snapshot safety cannot be verified, the runner must stay offline and require manual intervention.
- Login remains manually authorized unless a later explicit task changes that.
- Every live-control step must have a kill switch and verified `leave`.
- Browser-specific modules stay under `src/browser/runtime/`; browserless Node transport belongs under `src/node/browserless/` and shared pure helpers under `src/shared/`.
- Do not duplicate strategy constants and scoring when a pure helper already exists under `src/strategy/`.

## Current Validation Results

- Manual auth, stored token reuse, direct WS connect, text movement/shoot commands, and verified leave are proven in `headless-demo/`.
- Restart without reauthorization is proven.
- `GRZ1` version `1` gzip JSON parsing is proven.
- A 30 second read-only probe observed only `pos` and pushed `snapshot` frames: 569 `pos`, 30 `snapshot`, 0 decode errors.
- Coin drops and messages were observed only in pushed `snapshot`.
- `selfPresent` changes from true during the session to false after verified leave.

## Implementation Status

Update this table in the same task that completes each feature.

| Plan Item | Status | Evidence |
| --- | --- | --- |
| Commit 1: Extract Shared Frame Parser | Complete | `src/shared/grz-frame.js` owns `GRZ1` gzip JSON parsing and deterministic summaries; `headless-demo/server.js` calls the shared parser; `node grasp-rat-bot.js --self-test` includes focused parser coverage. |
| Commit 2: Add Pre-Login Snapshot Safety Probe | Complete | `headless-demo/server.js` exposes `lastSnapshotProbe` with cache-busted freshness checks; `headless-demo/README.md` documents the operator flow; `docs/agent/browserless-vps-migration.md` records the fresh VPS validation. |
| Commit 3: Create Node Browserless Session And Leave Client | Complete | `src/node/browserless/session-client.js` owns callback/meta-refresh/curl parsing, redaction, timeout fetch, and snapshot safety summaries; `src/node/browserless/leave-client.js` owns direct verified leave and retry summaries; `headless-demo/server.js` uses both modules. |
| Commit 4: Add Browserless WebSocket Transport | Complete | `src/node/browserless/ws-transport.js` owns direct WS URL construction, runtime fallback, connect/open/close/error/message dispatch, and narrow `sendVelocity()`/`sendShoot()` commands; `src/node/browserless/frame-stats.js` owns bounded probe statistics; `headless-demo/server.js` uses both modules. |
| Commit 5: Add Browserless State Store | Complete | `src/node/browserless/state-store.js` ingests `pos`, `snapshot`, and `shoot_ok` frames into authority-tagged realtime, snapshot fallback, and command states; self-tests cover selector isolation so combat-facing state cannot read snapshot-only coordinates. |
| Commit 6: Add Local Log Store And Retention | Complete | `src/node/browserless/local-log-store.js` appends redacted daily JSONL streams, `src/node/browserless/log-retention.js` deletes old UTC day directories, and `scripts/browserless-log-summary.js` generates stream/type summaries. |
| Commit 7: Add Runner CLI Skeleton | Complete | `scripts/browserless-runner.js`, `src/node/browserless/runner.js`, and `src/node/browserless/config.js` provide a dry-run/read-only CLI skeleton with `--once`, data/log dirs, status host/port placeholders, web token config, self-test, and fake read-only validation. |
| Commit 8: Add Status Server And Web Panel Skeleton | Complete | `src/node/browserless/status-server.js`, `web-panel.js`, and `state-file.js` provide token-gated status, a built-in VPS-oriented panel, redacted public status, persistent `state.json`, and a placeholder stop endpoint; `docs/agent/browserless-runner-operator.md` documents the operator surface. |
| Commit 9: Add Read-Only Canary Runner | Complete | `src/node/browserless/canary.js` runs pre-login snapshot safety, direct read-only WS frame collection, state-store ingestion, frame-health checks, local logs/status updates, and verified leave. The 2026-07-08 VPS read-only canary `read-only-20260708T142429656Z` passed audit with snapshot safety, 11987 decoded frames, 11987 self-observed frames, 0 decode errors, verified leave, 585 decision entries, and no movement or shoot commands. |
| Commit 10: Add Dry-Run Decision Adapter | Complete | `src/node/browserless/decision-adapter.js` maps browserless realtime/snapshot state into dry-run safety/profit/combat candidate decisions, keeps combat candidates on realtime `pos` authority, logs throttled `decisions` JSONL entries during read-only canaries, and surfaces current decision/profit/combat rows in status. |
| Commit 11: Add Safety And Exit Controller | Complete | `src/node/browserless/safety-controller.js` classifies no-self, WS close/error, frame gap, stale self, unsafe login point, stamina exhaustion, direct leave failure, and explicit stop events; the read-only canary now evaluates safety during the run, `/api/stop` requests a safety stop, and unsafe exits call verified `leave`. The 2026-07-08 VPS forced-stop canary `read-only-20260708T145958570Z` passed audit with 1 explicit-stop event, verified leave, 1189 decoded/self-observed frames, 59 decision entries, and no movement or shoot commands. |
| Commit 12: Add Movement-Only Live Mode | Complete | `src/node/browserless/action-adapter.js` maps safe coin movement decisions into velocity-only commands, tracks stop pulses and frame-based command settlement, and the runner/canary support `controlMode=movement-only` without shoot commands. The 2026-07-08 VPS movement-only canary `movement-only-20260708T151108072Z` passed audit with snapshot safety, 1213 decoded frames, 1212 self-observed frames, 0 decode errors, verified leave, 59 decisions, 60 velocity/movement-command entries, command settlement, and 0 shoot commands. |
| Commit 13: Add Non-Combat Profit Mode | Complete | `src/node/browserless/decision-adapter.js` now supports `controlMode=non-combat-profit`, prioritizes realtime/native coin drops when present, blocks snapshot fallback while realtime profit or visible active threats exist, keeps combat as diagnostics only, and moves only toward coin targets through the velocity-only action adapter. The 2026-07-08 VPS profit canary `non-combat-profit-20260708T151524293Z` passed audit with snapshot safety, 1212 decoded frames, 1211 self-observed frames, 0 decode errors, verified leave, 59 profit decisions, 60 velocity/movement-command entries, 58 visible coin actions, 0 combat actions, and 0 shoot commands. |
| Commit 14: Add Combat Dry-Run Mode | Implemented; VPS combat dry-run validation pending | `src/node/browserless/combat-adapter.js` maps realtime `pos` self/entities/bullets into target selection, movement, aim, and fire-discipline dry-run summaries; `controlMode=combat-dry-run` logs local `combat` JSONL windows and suppresses movement/shoot commands. Offline self-tests pass; a supervised VPS dry-run under visible Active-player conditions still needs review. |
| Commit 15: Add Guarded Combat Live Mode | Implemented; VPS live combat validation pending | `controlMode=combat-live` plus explicit `combatEnabled=true` enables guarded realtime combat movement and paced `sendShoot()` commands through `src/node/browserless/action-adapter.js`; default config keeps live combat off, shoot commands require fire-discipline/range/reserve gates, `shoot_ok` acknowledgements are surfaced in action state, and synthetic self-tests cover disabled and enabled paths. A supervised short VPS combat validation is still required before unattended use. |
| Commit 16: Add Supervisor And Deployment Surface | Complete | `deploy/browserless-runner.service`, `deploy/browserless-runner.env.example`, and `scripts/install-browserless-runner-service.sh` define the `grasp-rat-browserless-runner` systemd surface with `/etc/grasp-rat/browserless-runner.env`, `/var/lib/grasp-rat-browserless`, `/var/log/grasp-rat-browserless`, status token config, restart/journal controls, and safe dry-run defaults. VPS install/restart/status validation passed on 2026-07-08 after the runtime-directory installer fix in Commit 21. |
| Commit 17: Production Canary And Cutover Docs | Implemented; production cutover pending VPS acceptance | Runner config supports `--canary-profile read-only|movement-only|profit|combat-dry-run|combat-live` and `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` for staged rollout without code edits; `docs/agent/current-state.md`, `current-architecture.md`, `browserless-vps-migration.md`, `test-coverage.md`, and operator docs record the production canary/cutover surface while preserving the browser bot fallback. Local self-tests pass; headless-demo remains diagnostic until VPS runner canaries are accepted. |
| Commit 18: Add Canary Evidence Audit | Complete | `scripts/browserless-canary-audit.js` reads browserless JSONL logs for a UTC day and checks staged profile evidence for clean finish or forced-stop validation, verified leave, snapshot safety, decoded frames, decision logging, no forbidden shoot/action behavior, realtime combat authority, and combat dry-run suppression. `node grasp-rat-bot.js --self-test` covers normal read-only and forced-stop audit fixtures. VPS validations are still pending, but their evidence review now has a deterministic local command. |
| Commit 19: Add Deployment Evidence Audit | Complete | `scripts/browserless-deployment-audit.js` checks the installed systemd unit, env file, runner entrypoint, safe read-only dry-run env, non-placeholder web token, data/log directory access, and `systemctl is-enabled/is-active` status for `grasp-rat-browserless-runner`. `node grasp-rat-bot.js --self-test` covers successful and failing deployment-audit fixtures. The 2026-07-08 VPS deployment audit passed with the service enabled and active. |
| Commit 20: Add Aggregate Acceptance Report | Complete | `scripts/browserless-acceptance-report.js` aggregates deployment, read-only, forced-stop, movement-only, profit, combat-dry-run, and combat-live audit results into one cutover-readiness report. The canary audit now selects the latest clean finish for normal checks and explicit-stop evidence for forced-stop checks, so multiple same-day staged runs can be reviewed together. `node grasp-rat-bot.js --self-test` covers aggregate success and missing-profile failure fixtures. VPS evidence is still required before cutover. |
| Commit 21: Fix Runtime Directory Install | Complete | VPS deployment validation initially showed `status=226/NAMESPACE` because systemd could not apply `ReadWritePaths` for missing `/var/lib/grasp-rat-browserless` and `/var/log/grasp-rat-browserless`. `scripts/install-browserless-runner-service.sh` now creates both runtime directories, self-test anchors cover the installer surface, operator/migration docs run deployment audit with `sudo`, and the 2026-07-08 VPS rerun passed with `Browserless deployment audit: ok`. |
| Commit 22: Split Deployment Env Audit Modes | Complete | `scripts/browserless-deployment-audit.js` now supports `--env-mode safe|live|any`: safe preserves the initial dry-run/read-only deployment check, live verifies `DRY_RUN=false` plus session/login-point readiness before supervised live canaries, and any lets the final aggregate acceptance report verify the service surface after staged canary env changes. `scripts/browserless-acceptance-report.js` uses deployment env mode `any` by default, and self-tests cover live/aggregate deployment audit paths. |
| Commit 23: Align VPS Audit Commands | Complete | Operator and migration docs now run production canary audits with `sudo` for `/var/log/grasp-rat-browserless` access and use deployment `--env-mode any` for post-live service-surface checks, while keeping `--env-mode live` as the pre-restart readiness check before supervised canaries. |
| Commit 24: Harden Live Env Mode Consistency | Complete | `scripts/browserless-deployment-audit.js` now rejects mismatched `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` and `GRASP_RAT_BROWSERLESS_CONTROL_MODE` pairs in safe/live/any env modes, so VPS staged canaries cannot pass readiness with a misleading profile/control combination. Self-tests cover the conflict case and operator/migration/state docs record the constraint. |
| Commit 25: Scope Canary Audit To Selected Run | Complete | `scripts/browserless-canary-audit.js` now filters decision, combat, exit, and movement evidence to the selected canary final event's `startedAt`/`completedAt` window when available, while retaining whole-day compatibility for older logs. Self-tests include outside-window entries to prove staged same-day runs do not contaminate the selected audit. |
| Commit 26: Tighten Canary Action Evidence | Complete | `scripts/browserless-canary-audit.js` now fails read-only and combat-dry-run audits when scoped `movement-command` logs appear, and requires scoped movement logs alongside positive velocity counts for movement-only and profit profiles. Self-tests cover read-only action leakage inside the selected run window. |
| Commit 27: Require Combat Live Action Evidence | Complete | `scripts/browserless-canary-audit.js` now requires combat-live canaries to include scoped `movement-command` evidence alongside positive velocity counters, in addition to realtime combat logs and shoot acknowledgement checks. Self-tests cover accepted combat-live evidence and missing-action rejection. |
| Commit 28: Audit Scoped Shoot Command Evidence | Complete | `scripts/browserless-canary-audit.js` now detects scoped shoot evidence from action logs (`action.shoot.command`, cumulative `state.shootSentCount`, or `state.lastShootCommand`) so no-shoot profiles cannot pass with leaked shoot commands, and combat-live runs with logged shoot commands still require `lastShootAck`. Self-tests cover movement-only shoot leakage and combat-live missing acknowledgement from action-log evidence. |
| Commit 29: Expose Acceptance Evidence Summaries | Complete | `scripts/browserless-acceptance-report.js` now includes each canary section's selected final event, run window, decision/action/shoot/combat/forced-stop counts in human summaries, so final VPS cutover output is reviewable without opening the JSON report first. Self-tests cover movement/forced-stop summary evidence. |
| Commit 30: Add Canary Run Identity | Complete | `src/node/browserless/canary.js` now assigns a stable `runId` to each canary run and stamps runner/decision/action/combat/exit log entries with it. `scripts/browserless-canary-audit.js` prefers `runId` filtering before falling back to time-window filtering, and acceptance summaries include the selected run id. Self-tests cover deterministic id generation and same-window cross-run contamination rejection. |
| Commit 31: Harden Live Login Point Audit | Complete | `scripts/browserless-deployment-audit.js` now treats empty login-point fields as missing instead of numeric zero in live env mode, so supervised live canaries cannot pass readiness without explicit X/Y/HP coordinates. Self-tests cover empty login-point rejection. |
| Commit 32: Load Live Session From State | Complete | `scripts/browserless-import-state.js` imports already authorized legacy/demo state into production `state.json` without printing tokens; `src/node/browserless/runner.js` hydrates `userId`, `sessionToken`, and login-point coordinates from state when env/CLI fields are blank; the status API can request an auth URL and submit callback data for future manual authorization; live deployment audit accepts session/login-point evidence from state as well as env. Read-only bootstrap can learn an initial login point from realtime self and then requires a formal snapshot-safety canary, and canary audit rejects bootstrap-only finals as acceptance evidence. Self-tests cover import/hydration and bootstrap-only audit rejection. |

## Commit Plan

### Commit 1: Extract Shared Frame Parser

Files:

- Add `src/shared/grz-frame.js`.
- Update `headless-demo/server.js` to call the shared parser instead of local `zlib` decode logic.
- Add parser self-tests through `src/node/run-self-test.js` or a focused Node self-test wired into it.

Purpose:

- Move `GRZ1` version/gzip/JSON parsing out of the demo.
- Make decoded frame summaries deterministic and testable.
- Keep redaction and public status formatting outside the parser.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check headless-demo/server.js`
- `git diff --check`

### Commit 2: Add Pre-Login Snapshot Safety Probe

Files:

- Update `headless-demo/server.js`.
- Update `headless-demo/README.md`.
- Update `docs/agent/browserless-vps-migration.md`.

Purpose:

- Validate whether the VPS can fetch `/snapshot` before joining WS using the stored token/session shape.
- Record status, response keys, entity count, nearby active threats, and whether the last known login point can be evaluated.
- Establish the auth shape for the production snapshot safety client.

Validation:

- Local syntax checks.
- User VPS run: click snapshot safety probe while `inGame=false`, report `lastSnapshotProbe`.

### Commit 3: Create Node Browserless Session And Leave Client

Files:

- Add `src/node/browserless/session-client.js`.
- Add `src/node/browserless/leave-client.js`.
- Move reusable callback parsing helpers from `headless-demo/server.js` where practical.
- Add focused self-tests for callback parsing, token redaction, leave response summary, timeout handling, and failed snapshot safety gating.

Purpose:

- Separate operator/demo HTTP UI from reusable Node auth/session/leave primitives.
- Preserve the verified LinuxDO callback meta-refresh path.
- Keep direct leave small and testable without Clash rescue.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check headless-demo/server.js`
- `git diff --check`

### Commit 4: Add Browserless WebSocket Transport

Files:

- Add `src/node/browserless/ws-transport.js`.
- Add `src/node/browserless/frame-stats.js`.
- Update `headless-demo/server.js` to use the transport for demo/probe.

Purpose:

- Own Node `ws` creation, origin headers, open/close/error handling, frame dispatch, and bounded frame statistics outside the demo.
- Keep command send surface narrow: `sendVelocity()`, `sendShoot()`, `close()`.

Validation:

- Node self-tests with fake WebSocket.
- `node --check headless-demo/server.js`
- User VPS run only if transport behavior changes materially.

### Commit 5: Add Browserless State Store

Files:

- Add `src/node/browserless/state-store.js`.
- Add `src/node/browserless/protocol-types.md` if needed for frame shape notes.
- Add tests for `pos`, `snapshot`, and `shoot_ok` ingestion.

Purpose:

- Convert frame stream into current state: self, visible entities, bullets, snapshot fallback data, frame ages, and command acknowledgements.
- Explicitly tag each field with authority: `realtime` or `snapshot`.
- Provide selectors that make snapshot reads impossible from combat-facing code.

Validation:

- Self-tests with recorded/synthetic frame JSON.
- Static check that combat-facing selectors do not read snapshot-only coordinates.

### Commit 6: Add Local Log Store And Retention

Files:

- Add `src/node/browserless/local-log-store.js`.
- Add `src/node/browserless/log-retention.js`.
- Add `scripts/browserless-log-summary.js`.
- Update docs for 3-day retention and log file layout.

Purpose:

- Replace external log service needs with local JSONL files and lightweight summaries.
- Keep enough data for strategy improvement: sessions, decisions, frame health, exits, combat windows, and rewards.
- Delete logs older than 3 days.

Validation:

- Self-tests for append, redaction, rollover, retention deletion, and summary generation.
- No `combat-log-service` required for browserless normal operation.

### Commit 7: Add Runner CLI Skeleton

Files:

- Add `scripts/browserless-runner.js`.
- Add `src/node/browserless/runner.js`.
- Add `src/node/browserless/config.js`.
- Update `docs/agent/config-defaults.md` with browserless defaults.

Purpose:

- Provide the real non-demo entrypoint with `--read-only`, `--dry-run`, `--once`, `--data-dir`, `--status-port`, and `--web-token`.
- Start with read-only mode only.

Validation:

- CLI self-test/fake transport.
- `node --check scripts/browserless-runner.js`
- `git diff --check`

### Commit 8: Add Status Server And Web Panel Skeleton

Files:

- Add `src/node/browserless/status-server.js`.
- Add `src/node/browserless/web-panel.js` or static panel assets under a Node-owned path.
- Add `src/node/browserless/state-file.js`.
- Update operator docs.

Purpose:

- Persist token/session metadata, last run/probe summaries, login-point safety status, current self, current action, stamina, profit, combat summary, recent exits, and log paths.
- Provide a web page equivalent to the current script panel but less cramped and tailored for unattended VPS operation.
- Keep secrets redacted in status, logs, and errors.

Validation:

- Fake HTTP tests for auth, status, redaction, and unauthorized access.
- Manual local smoke with fake token only.

### Commit 9: Add Read-Only Canary Runner

Files:

- Update `src/node/browserless/runner.js`.
- Add `src/node/browserless/canary.js`.
- Wire local log store and web panel status.

Purpose:

- Run a bounded read-only canary on VPS: pre-login snapshot safety check, connect, parse frames, track health, verified leave, no control commands.
- Establish frame gap and no-self detection before live control.

Validation:

- User VPS run: 10-30 minute read-only canary.
- Expected: stable `pos` cadence, pushed `snapshot` cadence, self present before leave, self absent after leave, no unexpected frame types that break parser.

### Commit 10: Add Dry-Run Decision Adapter

Files:

- Add `src/node/browserless/decision-adapter.js`.
- Map browserless state store into pure `src/strategy/` inputs for safety, profit, and combat candidates.
- Add decision JSONL logs and panel rows.

Purpose:

- Produce decisions without sending movement or shoot commands.
- Identify browser-only data gaps before live control.
- Keep chase-mode inputs absent.

Validation:

- Offline tests over synthetic state.
- User VPS dry-run canary if state coverage is uncertain.

### Commit 11: Add Safety And Exit Controller

Files:

- Add `src/node/browserless/safety-controller.js`.
- Add no-self, WS close/error, frame gap, stale self, unsafe login point, stamina exhaustion, direct leave failure alert, and explicit stop handling.
- Wire verified `leave` through `leave-client.js`.

Purpose:

- Make exit behavior production-grade before live movement.
- Ensure every unsafe state produces stop motion plus verified leave when appropriate.
- Alert and stop when direct leave is not confirmed; do not attempt Clash rescue.

Validation:

- Self-tests for each safety condition using fake transport.
- Live read-only canary with forced stop/leave from status API.

### Commit 12: Add Movement-Only Live Mode

Files:

- Add `src/node/browserless/action-adapter.js`.
- Update runner config with `controlMode=movement-only`.
- Wire velocity commands, stop pulses, and command settlement tracking.

Purpose:

- Enable controlled movement without shooting.
- Validate direct movement settlement and frame response outside the browser.

Validation:

- Fake transport tests.
- User VPS supervised short run with movement-only enabled and verified leave.

### Commit 13: Add Non-Combat Profit Mode

Files:

- Update `decision-adapter.js`.
- Reuse coin/profit strategy helpers from `src/strategy/`.
- Add snapshot coin fallback only for non-combat profit, with realtime-visible profit priority preserved.

Purpose:

- Let browserless runner collect safe visible/realtime profit first, then guarded snapshot coin fallback only when realtime profit is absent.
- Keep combat disabled.

Validation:

- Offline strategy tests.
- User VPS supervised non-combat run with local logs reviewed before default enablement.

### Commit 14: Add Combat Dry-Run Mode

Files:

- Add `src/node/browserless/combat-adapter.js`.
- Map visible `pos` entities/bullets into existing combat target/movement/aim/fire pure helpers.
- Add local combat window logs for review.

Purpose:

- Verify browserless realtime state is sufficient for combat decisions before firing.
- Detect missing browser-only fields and either map them or gate combat off.

Validation:

- Offline tests for target selection and aim inputs.
- User VPS dry-run under visible active-player conditions if available.

### Commit 15: Add Guarded Combat Live Mode

Files:

- Update `combat-adapter.js`, `action-adapter.js`, and runner config.
- Add explicit `combatEnabled` default false.
- Add fire command pacing, reserve enforcement, command ack logging, and panel combat rows.

Purpose:

- Enable live shoot only under existing strategy gates and explicit config.
- Keep a fast verified leave path for combat disadvantage/no-self/frame-gap states.

Validation:

- Offline replay or synthetic combat tests before shipping.
- User supervised short live combat validation before any unattended run.

### Commit 16: Add Supervisor And Deployment Surface

Files:

- Add `deploy/browserless-runner.service`.
- Add `deploy/browserless-runner.env.example`.
- Add `scripts/install-browserless-runner-service.sh` if the install steps are repetitive enough to justify a helper.
- Add operator README for env vars, status port, data/log dirs, restart, retention, and emergency stop.
- Update `docs/agent/browserless-vps-migration.md`.

Purpose:

- Make the runner operable as a service, not a foreground demo.
- Keep demo and production service names distinct until cutover.
- Establish the production operation shape:
  - service name: `grasp-rat-browserless-runner`;
  - executable: `node scripts/browserless-runner.js`;
  - env file: `/etc/grasp-rat/browserless-runner.env`;
  - data dir: `/var/lib/grasp-rat-browserless`;
  - log dir: `/var/log/grasp-rat-browserless`;
  - status panel bound to the configured host/port with a required web token;
  - standard controls through `systemctl start|stop|restart|status grasp-rat-browserless-runner`;
  - journal visibility through `journalctl -u grasp-rat-browserless-runner`.
- Keep `headless-demo/start-demo.sh` documented only as a diagnostic/protocol probe, not a production run path.

Validation:

- Local unit file syntax review.
- User VPS systemd install/restart/status check when ready.

### Commit 17: Production Canary And Cutover Docs

Files:

- Update runner CLI/config with `--canary-profile read-only|movement-only|profit|combat-dry-run|combat-live`.
- Update `docs/agent/current-state.md`, `docs/agent/current-architecture.md`, `docs/agent/browserless-vps-migration.md`, and `docs/agent/test-coverage.md`.
- Mark `headless-demo/` as diagnostic/superseded once runner canary is accepted.

Purpose:

- Provide staged rollout without code edits.
- Record browserless runner as an accepted runtime surface while preserving the browser bot fallback path.

Validation:

- Browserless runner self-tests.
- `node grasp-rat-bot.js --self-test`
- `node scripts/objective-status.js --self-test`
- `git diff --check`

### Commit 18: Add Canary Evidence Audit

Files:

- Add `scripts/browserless-canary-audit.js`.
- Add self-test coverage for normal read-only and forced-stop audit evidence.
- Update operator and migration docs with the audit command.

Purpose:

- Make VPS canary acceptance review deterministic from local JSONL logs instead of relying only on manual `tail` inspection.
- Check the evidence that matters for each staged profile: snapshot safety, decoded realtime frames, self observation, decision logs, verified leave, forced stop when requested, no forbidden movement/shoot behavior, realtime combat authority, combat dry-run suppression, and combat live acknowledgement evidence when shots are sent.
- Keep validation honest: the audit can prove that a reported VPS log set has the expected evidence, but it does not replace running the VPS canary.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 19: Add Deployment Evidence Audit

Files:

- Add `scripts/browserless-deployment-audit.js`.
- Add self-test coverage for installed-service evidence checks.
- Update operator and migration docs with the deployment audit command.

Purpose:

- Make the VPS systemd validation deterministic after install/start.
- Check installed unit and env evidence for the production service name, working directory, entrypoint, env file reference, restart policy, read/write paths, safe initial read-only dry-run config, non-placeholder web token, data/log directory access, and enabled/active systemd state.
- Keep deployment verification separate from live game canary evidence.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-deployment-audit.js`
- `git diff --check`

### Commit 20: Add Aggregate Acceptance Report

Files:

- Add `scripts/browserless-acceptance-report.js`.
- Update `scripts/browserless-canary-audit.js` so same-day staged runs do not cross-contaminate normal read-only and forced-stop evidence.
- Add self-test coverage for aggregate acceptance reporting.
- Update operator and migration docs with the cutover report command.

Purpose:

- Provide one deterministic readiness command after all VPS canaries and the deployment check have been run.
- Aggregate deployment, read-only, forced-stop, movement-only, profit, combat-dry-run, and combat-live evidence into one pass/fail report.
- Keep final cutover acceptance grounded in audited VPS logs instead of manual checklist interpretation.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-acceptance-report.js`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 21: Fix Runtime Directory Install

Files:

- Update `scripts/install-browserless-runner-service.sh`.
- Update installer self-test anchors in `src/node/run-self-test.js`.
- Update operator, migration, current-state, test-coverage, and this development plan documentation.

Purpose:

- Fix the VPS systemd failure where `grasp-rat-browserless-runner` exited with `status=226/NAMESPACE` because systemd could not apply `ReadWritePaths` for missing `/var/lib/grasp-rat-browserless` and `/var/log/grasp-rat-browserless`.
- Keep the installed env file private at `0640`, but document that deployment audit should run with `sudo` so the audit can read `/etc/grasp-rat/browserless-runner.env`.
- Preserve safe read-only/dry-run defaults while making install/reinstall idempotently prepare the runtime filesystem surface.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node scripts/browserless-runner.js --self-test`
- `node scripts/objective-status.js --self-test`
- `node --check scripts/browserless-deployment-audit.js`
- `node --check src/node/run-self-test.js`
- `sh -n scripts/install-browserless-runner-service.sh`
- `systemd-analyze verify deploy/browserless-runner.service`
- `git diff --check`

### Commit 22: Split Deployment Env Audit Modes

Files:

- Update `scripts/browserless-deployment-audit.js`.
- Update `scripts/browserless-acceptance-report.js`.
- Update browserless self-test coverage and operator/migration/state docs.

Purpose:

- Keep the initial deployment audit strict about safe dry-run/read-only defaults.
- Add a live readiness mode that catches missing session token, user id, and login-point values before a supervised live canary.
- Prevent final aggregate acceptance from failing only because the service env has legitimately moved from safe dry-run into a staged live canary profile.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-deployment-audit.js`
- `node --check scripts/browserless-acceptance-report.js`
- `git diff --check`

### Commit 23: Align VPS Audit Commands

Files:

- Update `docs/agent/browserless-runner-operator.md`.
- Update `docs/agent/browserless-vps-migration.md`.
- Update `docs/agent/current-state.md` and this development plan.

Purpose:

- Make production canary audit commands match the protected `/var/log/grasp-rat-browserless` path by running them with `sudo`.
- Avoid post-live handoff checks accidentally reusing the default safe dry-run deployment audit after `GRASP_RAT_BROWSERLESS_DRY_RUN=false` is intentionally set.
- Preserve `--env-mode live` as the explicit readiness check before restarting into a live canary.

Validation:

- `git diff --check`

### Commit 24: Harden Live Env Mode Consistency

Files:

- Update `scripts/browserless-deployment-audit.js`.
- Update browserless deployment audit self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Catch env files where `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` and `GRASP_RAT_BROWSERLESS_CONTROL_MODE` are both present but point to different staged modes.
- Make `--env-mode live` a stronger pre-restart guard before supervised canaries.
- Keep the final `--env-mode any` service-surface check from accepting misleading staged rollout env.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-deployment-audit.js`
- `git diff --check`

### Commit 25: Scope Canary Audit To Selected Run

Files:

- Update `scripts/browserless-canary-audit.js`.
- Update browserless canary audit self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Count `decisions`, `combat`, `exits`, and `movement-command` evidence only inside the selected canary run when `startedAt`/`completedAt` are present.
- Avoid false pass/fail evidence when multiple staged canaries run on the same UTC day.
- Keep older logs without run timestamps auditable by falling back to whole-day evidence.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 26: Tighten Canary Action Evidence

Files:

- Update `scripts/browserless-canary-audit.js`.
- Update browserless canary audit self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Make read-only and combat-dry-run audits fail if the selected run contains movement-command evidence.
- Require movement-only and non-combat profit canaries to have both positive final velocity counters and scoped movement-command logs.
- Reduce false acceptance from inconsistent final summaries or stale same-day action logs.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 27: Require Combat Live Action Evidence

Files:

- Update `scripts/browserless-canary-audit.js`.
- Update browserless canary audit self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Require guarded combat-live canaries to prove that the action adapter actually logged a scoped movement/action row.
- Keep shoot acknowledgement validation for runs that send shots.
- Prevent combat-live acceptance from passing on combat summaries alone.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 28: Audit Scoped Shoot Command Evidence

Files:

- Update `scripts/browserless-canary-audit.js`.
- Update browserless canary audit self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Detect scoped shoot commands from action-log evidence, not only final canary counters.
- Make no-shoot profile audits fail if action logs show a leaked shoot command.
- Make combat-live shoot acknowledgement checks apply when scoped action logs prove a shot was sent even if the final counter is inconsistent.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 29: Expose Acceptance Evidence Summaries

Files:

- Update `scripts/browserless-acceptance-report.js`.
- Update aggregate acceptance self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Make final human acceptance output show which canary run was selected.
- Surface run-window and key evidence counts for decisions, movement commands, shoot commands, combat logs, and explicit stop.
- Reduce the need to inspect full JSON before deciding whether the VPS cutover report is the intended evidence set.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-acceptance-report.js`
- `git diff --check`

### Commit 30: Add Canary Run Identity

Files:

- Update `src/node/browserless/canary.js`.
- Update `scripts/browserless-canary-audit.js`.
- Update `scripts/browserless-acceptance-report.js`.
- Update browserless canary audit self-test coverage.
- Update operator, migration, current-state, test-coverage, and this development plan.

Purpose:

- Stamp every canary run and its JSONL evidence with a stable `runId`.
- Make canary audits prefer exact run-id evidence correlation before using timestamp windows.
- Make aggregate acceptance summaries show the selected run id for VPS handoff review.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check src/node/browserless/canary.js`
- `node --check scripts/browserless-canary-audit.js`
- `git diff --check`

### Commit 31: Harden Live Login Point Audit

Files:

- Update `scripts/browserless-deployment-audit.js`.
- Update browserless deployment audit self-test coverage.
- Update migration notes and this development plan.

Purpose:

- Reject empty `GRASP_RAT_BROWSERLESS_LOGIN_POINT_X/Y/HP` values during `--env-mode live`.
- Prevent live readiness from treating blank login-point fields as numeric zero.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-deployment-audit.js`
- `node --check src/node/run-self-test.js`
- `git diff --check`

### Commit 32: Load Live Session From State

Files:

- Add `scripts/browserless-import-state.js`.
- Update `src/node/browserless/state-file.js`.
- Update `src/node/browserless/runner.js`.
- Update `src/node/browserless/status-server.js`.
- Update `src/node/browserless/canary.js`.
- Update `scripts/browserless-deployment-audit.js`.
- Update `scripts/browserless-canary-audit.js`.
- Update browserless self-test coverage and operator/migration/current-state/test docs.

Purpose:

- Import already authorized demo/headless state into the production browserless state file without printing tokens.
- Hydrate live runner config from persisted state when env/CLI session and login-point values are blank.
- Let live deployment readiness accept state-backed session/login-point evidence, while still requiring `DRY_RUN=false` and consistent staged profile/control mode.
- Add token-gated status endpoints for requesting an auth URL and submitting callback data when no reusable state exists.
- Allow a read-only bootstrap run only to learn an initial login point, then require a formal snapshot-safety canary; reject bootstrap-only finals in canary acceptance audits.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check scripts/browserless-import-state.js`
- `node --check scripts/browserless-deployment-audit.js`
- `node --check scripts/browserless-canary-audit.js`
- `node --check src/node/browserless/runner.js`
- `node --check src/node/browserless/canary.js`
- `node --check src/node/browserless/status-server.js`
- `node --check src/node/browserless/state-file.js`
- `node --check src/node/run-self-test.js`
- `git diff --check`

## External VPS Validation Required

Local implementation work is complete through Commit 32, and the VPS systemd deployment validation passed on 2026-07-08. The production runner is not accepted until the remaining live canary validations below produce evidence and the aggregate acceptance report passes.

Use the production service path and audit commands from `docs/agent/browserless-vps-migration.md` and `docs/agent/browserless-runner-operator.md`. Do not mark `headless-demo/` superseded until these validations pass:

1. Combat dry-run canary: realtime-only combat targets, aim/fire summaries, suppressed commands, verified `leave`, and `--profile combat-dry-run`.
2. Guarded combat live canary: explicit `combatEnabled=true`, realtime combat movement/shoot pacing, `shoot_ok` evidence when shots are sent, verified `leave`, and `--profile combat-live`.
3. Final cutover readiness: `sudo node scripts/browserless-acceptance-report.js --log-dir /var/log/grasp-rat-browserless --day YYYY-MM-DD --fail-on-incomplete`.

Completed VPS deployment validation:

- 2026-07-08: After pulling `223551d` and rerunning `sudo scripts/install-browserless-runner-service.sh --install-env`, `grasp-rat-browserless-runner` restarted as active, the data/log runtime directories existed, `systemctl is-enabled/is-active` passed, and `sudo node scripts/browserless-deployment-audit.js --fail-on-incomplete` returned `Browserless deployment audit: ok`.
- 2026-07-08: The first service log review after deployment confirmed only the intended safe default dry-run skeleton path: `dryRun:true`, `controlMode:"read-only"`, `userId:0`, `sessionTokenPresent:false`, `runner-start`, and `runner-dry-run`. `browserless-canary-audit --profile read-only` was incomplete because no live WS canary had run yet.
- 2026-07-08: A live-readiness attempt failed before canary start because the VPS checkout was stale and `scripts/browserless-deployment-audit.js` did not recognize `--env-mode`. This is not accepted canary evidence; the next attempt must pull `origin/main`, verify the audit help lists `--env-mode`, and only restart after the live env audit passes.
- 2026-07-08: VPS inspection found reusable legacy demo state at `headless-demo/data/state.json` with a user id, token present, and a last self/login point. Commit 32 adds a production import/hydration path so operators no longer need to copy `USER_ID`, `SESSION_TOKEN`, or login-point values into the env file.
- 2026-07-08: The production read-only canary passed on VPS with run id `read-only-20260708T142429656Z` over `2026-07-08T14:24:29.656Z .. 2026-07-08T14:34:32.273Z`. Audit accepted snapshot safety, 11987 decoded frames, 11987 self-observed frames, 0 decode errors, verified `leave`, 585 decision entries, 0 movement commands, and 0 shoot commands.
- 2026-07-08: The forced-stop read-only canary passed on VPS with run id `read-only-20260708T145958570Z` over `2026-07-08T14:59:58.570Z .. 2026-07-08T15:00:59.352Z`. Audit accepted 1 explicit-stop event from the status API, verified `leave`, 1189 decoded frames, 1189 self-observed frames, 0 decode errors, 59 decision entries, 0 movement commands, and 0 shoot commands.
- 2026-07-08: The movement-only canary passed on VPS with run id `movement-only-20260708T151108072Z` over `2026-07-08T15:11:08.072Z .. 2026-07-08T15:12:10.382Z`. Audit accepted snapshot safety, 1213 decoded frames, 1212 self-observed frames, 0 decode errors, verified `leave`, 59 decision entries, 60 velocity/movement-command entries, command settlement, and 0 shoot commands.
- 2026-07-08: The non-combat profit canary passed on VPS with run id `non-combat-profit-20260708T151524293Z` over `2026-07-08T15:15:24.293Z .. 2026-07-08T15:16:26.489Z`. Audit accepted snapshot safety, 1212 decoded frames, 1211 self-observed frames, 0 decode errors, verified `leave`, 59 profit decision entries, 60 velocity/movement-command entries, 58 visible coin actions, 0 combat actions, and 0 shoot commands.

Historical snapshot safety validation:

- Direct `/snapshot?user_id=<id>&token=<token>` fetch works before WS join and returns the expected full snapshot shape.
- Cache-busted direct snapshot passed freshness and radius safety checks before WS join. The response tick was newer than the latest known WS tick, self was absent, and the persisted healthy login point had 0 nearby Active entities inside the 170m radius.

Other completed VPS/demo validations:

- Bounded read-only WS probe: only `pos` and pushed `snapshot` appeared; coin drops/messages appeared only in `snapshot`.
- Stored token reuse across process restart.
- Verified leave and post-leave `selfPresent=false`.

Later validations are staged and should not be combined:

- Combat dry-run review after Commit 14.
- Short supervised live combat run after Commit 15.
- Systemd service restart/status check after Commit 16.

## Rollback Strategy

- Commits 1-9 are parser/session/read-only/status/logging infrastructure. They can be rolled back without affecting the browser bot.
- Commits 10-15 must keep live control behind config flags defaulting to off until each stage is validated.
- The browser bot build/release path remains separate. Browserless runner failures should not block browser bot emergency fixes.
- Every live-control canary must end with verified `leave`; if `leave` is not confirmed, the runner must raise a status alert and stop further control attempts.
