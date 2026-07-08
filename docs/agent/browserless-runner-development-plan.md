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
| Commit 9: Add Read-Only Canary Runner | Implemented; VPS validation pending | `src/node/browserless/canary.js` runs pre-login snapshot safety, direct read-only WS frame collection, state-store ingestion, frame-health checks, local logs/status updates, and verified leave. Fake self-tests pass; the required 10-30 minute VPS canary still needs operator validation. |
| Commit 10: Add Dry-Run Decision Adapter | Complete | `src/node/browserless/decision-adapter.js` maps browserless realtime/snapshot state into dry-run safety/profit/combat candidate decisions, keeps combat candidates on realtime `pos` authority, logs throttled `decisions` JSONL entries during read-only canaries, and surfaces current decision/profit/combat rows in status. |
| Commit 11: Add Safety And Exit Controller | Not started | No browserless safety controller yet. |
| Commit 12: Add Movement-Only Live Mode | Not started | No browserless action adapter or movement-only live mode yet. |
| Commit 13: Add Non-Combat Profit Mode | Not started | Browserless profit mode not implemented yet. |
| Commit 14: Add Combat Dry-Run Mode | Not started | No browserless combat adapter yet. |
| Commit 15: Add Guarded Combat Live Mode | Not started | Live browserless combat remains unavailable and default-off. |
| Commit 16: Add Supervisor And Deployment Surface | Not started | Production service files are not present yet. |
| Commit 17: Production Canary And Cutover Docs | Not started | Cutover docs wait for accepted production canaries. |

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

## User Validation Required

Immediate new validation exposed by this revision:

1. Run a pre-login snapshot safety probe from VPS while `inGame=false`.
2. Confirm whether direct `/snapshot` can be fetched with the stored token/session shape before WS join.
3. Confirm whether the response contains enough entity coordinates/modes to evaluate the last login point safety radius.

Status on 2026-07-08: direct `/snapshot?user_id=<id>&token=<token>` fetch works before WS join and returns the expected full snapshot shape. The first safety verdict was blocked only because the demo state predated `lastSelfSummary` persistence and therefore had no login point. A fresh updated-code WS probe/demo run should populate `lastSelfSummary`, then the snapshot safety probe can complete the radius evaluation.

Follow-up on 2026-07-08: a later radius verdict was positive, but the returned snapshot tick was older than the latest known WS tick and still showed self as `InGame` after verified leave. The production safety client must cache-bust snapshot requests and reject stale ticks before trusting the radius verdict.

Final 2026-07-08 validation: cache-busted direct snapshot passed freshness and radius safety checks before WS join. The response tick was newer than the latest known WS tick, self was absent, and the persisted healthy login point had 0 nearby Active entities inside the 170m radius. The pre-login snapshot safety path is validated for implementation.

Already completed:

- Bounded read-only WS probe: only `pos` and pushed `snapshot` appeared; coin drops/messages appeared only in `snapshot`.
- Stored token reuse across process restart.
- Verified leave and post-leave `selfPresent=false`.

Later validations are staged and should not be combined:

- 10-30 minute read-only canary after Commit 9.
- Short supervised movement-only run after Commit 12.
- Supervised non-combat profit run after Commit 13.
- Combat dry-run review after Commit 14.
- Short supervised live combat run after Commit 15.
- Systemd service restart/status check after Commit 16.

## Rollback Strategy

- Commits 1-9 are parser/session/read-only/status/logging infrastructure. They can be rolled back without affecting the browser bot.
- Commits 10-15 must keep live control behind config flags defaulting to off until each stage is validated.
- The browser bot build/release path remains separate. Browserless runner failures should not block browser bot emergency fixes.
- Every live-control canary must end with verified `leave`; if `leave` is not confirmed, the runner must raise a status alert and stop further control attempts.
