# Browserless Runner Development Plan

This is the commit-by-commit plan for turning the verified `headless-demo/` probe into a production browserless VPS runner. It is intentionally staged so each commit has one owner, one validation surface, and a rollback boundary.

The durable migration findings remain in `docs/agent/browserless-vps-migration.md`. This file owns the implementation sequence.

## Product Target

Build a VPS-side Node runner that can operate without a local browser by using the direct game auth/session, WebSocket state frames, text control commands, and verified HTTP `leave`.

The finished runner should:

- persist and reuse a manually authorized token;
- connect directly to `wss://grasp-rat-game.h-e.top/ws`;
- parse `GRZ1` gzip JSON frames;
- maintain realtime visible state from `pos` frames;
- use snapshot data only for non-combat fallback flows;
- reuse existing `src/strategy/` pure policy where possible;
- send movement, shooting, and leave commands through a narrow transport adapter;
- expose compact status and JSONL logs on the VPS;
- exit safely on no-self, frame gaps, command stalls, stamina exhaustion, or explicit stop;
- support dry-run/canary modes before any unattended live control.

## Non-Negotiable Constraints

- Combat target, aim, and fire decisions must use realtime/native visible state only. Snapshot data is not combat authority.
- Ordinary profit should prefer realtime/native visible coins and visible/native AFK targets. Snapshot coin data can be a fallback only when realtime profit is absent.
- Login remains manually authorized unless a later explicit task changes that.
- Every live-control step must have a kill switch and verified `leave`.
- Do not regress the browser bot architecture. Browser-specific modules stay under `src/browser/runtime/`; browserless Node transport belongs under `src/node/` or shared pure helpers under `src/shared/`.
- Do not duplicate strategy constants and scoring when a pure helper already exists under `src/strategy/`.

## Commit Plan

### Commit 1: Extract Shared Frame Parser

Files:

- Add `src/shared/grz-frame.js`.
- Update `headless-demo/server.js` to call the shared parser instead of local `zlib` decode logic.
- Add parser self-tests through `src/node/run-self-test.js` or a focused Node self-test file wired into it.

Purpose:

- Move `GRZ1` version/gzip/JSON parsing out of the demo.
- Make decoded frame summaries deterministic and testable.
- Keep redaction and public summarization outside the parser.

Validation:

- `node grasp-rat-bot.js --self-test`
- `node --check headless-demo/server.js`
- `git diff --check`

### Commit 2: Add Read-Only VPS Probe

Files:

- Update `headless-demo/server.js`.
- Update `headless-demo/README.md`.
- Update `docs/agent/browserless-vps-migration.md`.

Purpose:

- Add an explicit read-only probe that opens WS, sends no movement/fire commands, records frame type/key/count statistics for a bounded duration, then verified-leaves.
- Use it to validate long-enough direct WS state coverage before building profit/control logic.

Validation:

- Local syntax checks.
- User VPS run: restart demo, run read-only probe, report `lastProbe`.

### Commit 3: Create Node Browserless Session Client

Files:

- Add `src/node/browserless/session-client.js`.
- Add `src/node/browserless/leave-client.js`.
- Move reusable auth callback parsing helpers from `headless-demo/server.js` where practical.
- Add focused self-tests for callback parsing, token redaction, leave response summary, timeout handling.

Purpose:

- Separate operator/demo HTTP UI from reusable Node auth/session/leave primitives.
- Preserve the already verified LinuxDO callback meta-refresh path.

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

Validation:

- Self-tests with recorded/synthetic frame JSON.
- Static check that combat-facing selectors do not read snapshot-only coordinates.

### Commit 6: Add Browserless Runner CLI Skeleton

Files:

- Add `scripts/browserless-runner.js`.
- Add `src/node/browserless/runner.js`.
- Add `src/node/browserless/config.js`.
- Add `docs/agent/config-defaults.md` entries for new browserless defaults.

Purpose:

- Provide a real non-demo entrypoint with `--once`, `--dry-run`, `--read-only`, `--data-dir`, `--status-port`, and `--require-web-token`.
- Start with read-only mode only.

Validation:

- CLI self-test/fake transport.
- `node --check scripts/browserless-runner.js`
- `git diff --check`

### Commit 7: Add Status Server And Persistence

Files:

- Add `src/node/browserless/status-server.js`.
- Add `src/node/browserless/state-file.js`.
- Update `scripts/browserless-runner.js`.
- Add operator docs.

Purpose:

- Persist token/session metadata, last run/probe summaries, and compact status.
- Keep secrets redacted in status, logs, and errors.

Validation:

- Fake HTTP tests for auth, status, redaction, and unauthorized access.
- Manual local smoke with fake token only.

### Commit 8: Add Read-Only Canary Runner

Files:

- Update `src/node/browserless/runner.js`.
- Add `src/node/browserless/canary.js`.
- Add JSONL logging helpers if existing combat-log-service logging is not yet appropriate.

Purpose:

- Run a bounded read-only canary on VPS: connect, parse frames, track health, verified leave, no control commands.
- Establish frame gap and no-self detection before live control.

Validation:

- User VPS run: 10-30 minute read-only canary.
- Expected: stable `pos` cadence, self present before leave, self absent after leave, no unexpected frame types that break parser.

### Commit 9: Add Dry-Run Decision Adapter

Files:

- Add `src/node/browserless/decision-adapter.js`.
- Add mapping from browserless state store into pure `src/strategy/` inputs for safe/profit/combat candidates.
- Add decision JSONL logs.

Purpose:

- Produce decisions without sending movement or shoot commands.
- Identify gaps between browser runtime context and browserless state.

Validation:

- Offline tests over synthetic state snapshots.
- User VPS dry-run canary if state coverage is uncertain.

### Commit 10: Add Safety And Exit Controller

Files:

- Add `src/node/browserless/safety-controller.js`.
- Add no-self, WS close/error, frame gap, stale self, stamina exhaustion, and explicit stop handling.
- Wire verified `leave` through `leave-client.js`.

Purpose:

- Make exit behavior production-grade before live movement.
- Ensure every unsafe state produces stop motion plus verified leave when appropriate.

Validation:

- Self-tests for each safety condition using fake transport.
- Live read-only canary with forced stop/leave from status API.

### Commit 11: Add Movement-Only Live Mode

Files:

- Add `src/node/browserless/action-adapter.js`.
- Update runner config with `controlMode=movement-only`.
- Wire velocity commands, stop pulses, and command ack/settlement tracking.

Purpose:

- Enable controlled movement without shooting.
- Validate direct movement settlement and frame response outside the browser.

Validation:

- Fake transport tests.
- User VPS supervised short run with movement-only enabled and verified leave.

### Commit 12: Add Non-Combat Profit Mode

Files:

- Update `decision-adapter.js`.
- Reuse coin/profit strategy helpers from `src/strategy/`.
- Add snapshot fallback only for non-combat profit, with realtime-visible profit priority preserved.

Purpose:

- Let browserless runner collect safe visible/realtime profit first, then guarded snapshot coin fallback only when realtime profit is absent.
- Keep combat disabled.

Validation:

- Offline strategy tests.
- User VPS supervised non-combat run with logs reviewed before default enablement.

### Commit 13: Add Combat Dry-Run Mode

Files:

- Add `src/node/browserless/combat-adapter.js`.
- Map visible `pos` entities/bullets into existing combat target/movement/aim/fire pure helpers.
- Add combat dry-run logs compatible with combat review tooling where practical.

Purpose:

- Verify browserless state is sufficient for combat decisions before firing.
- Detect missing browser-only fields and either map them or gate combat off.

Validation:

- Offline tests for target selection and aim inputs.
- User VPS dry-run under visible active-player conditions if available.

### Commit 14: Add Guarded Combat Live Mode

Files:

- Update `combat-adapter.js`, `action-adapter.js`, and runner config.
- Add explicit `combatEnabled` default false.
- Add fire command pacing, reserve enforcement, and command ack logging.

Purpose:

- Enable live shoot only under existing strategy gates and explicit config.
- Keep a fast verified leave path for combat disadvantage/no-self/frame-gap states.

Validation:

- Offline replay or synthetic combat tests before shipping.
- User supervised short live combat validation before any unattended run.

### Commit 15: Add Browserless Logging Integration

Files:

- Add browserless log emitter compatible with `combat-log-service` where possible.
- Update `docs/agent/combat-logging.md` and `docs/agent/test-coverage.md`.

Purpose:

- Preserve daily report and combat-review workflows for browserless sessions.
- Avoid losing visibility when the browser UI is not present.

Validation:

- `cd combat-log-service && npm test`
- Generate a test daily summary from synthetic browserless logs.

### Commit 16: Add Supervisor/Deployment Surface

Files:

- Add `deploy/browserless-runner.service` or extend `headless-demo/grasp-rat-headless-demo.service` into a production unit.
- Add operator README for VPS env vars, status port, logs, restart, and emergency stop.
- Update `docs/agent/browserless-vps-migration.md`.

Purpose:

- Make the runner operable as a service, not a foreground demo.
- Keep demo and production service names distinct until cutover.

Validation:

- Local unit file syntax review.
- User VPS systemd install/restart/status check when ready.

### Commit 17: Add Production Canary Mode

Files:

- Update runner CLI/config.
- Add `--canary-profile read-only|movement-only|profit|combat-dry-run|combat-live`.
- Add status rows for canary profile, duration, last exit reason, and token age.

Purpose:

- Provide staged rollout without code edits.
- Make it easy to stop at the highest validated safety level.

Validation:

- User VPS canary runs at each profile before promotion.

### Commit 18: Cutover And Cleanup

Files:

- Update `docs/agent/current-state.md`, `docs/agent/current-architecture.md`, `docs/agent/browserless-vps-migration.md`, and `docs/agent/test-coverage.md`.
- Keep `headless-demo/` as a diagnostic tool or mark it superseded.
- Add final release/cutover checklist.

Purpose:

- Record browserless runner as an accepted runtime surface.
- Preserve fallback browser bot path until browserless live behavior is proven.

Validation:

- Full release validation relevant to changed code:
  - `node grasp-rat-bot.js --self-test`
  - `node scripts/objective-status.js --self-test`
  - `cd combat-log-service && npm test`
  - browserless runner self-tests
  - `git diff --check`

## User Validation Required

Planning exposes one immediate protocol validation before product control work should proceed:

1. Run a bounded read-only VPS probe after Commit 2.
2. Confirm whether frame traffic contains only `pos` and pushed `snapshot`, or additional realtime coin/drop/message frame types.
3. Confirm a longer no-action connection leaves cleanly and `selfPresent` changes from true to false after verified leave.

Status on 2026-07-08: complete for the first 30 second probe. It observed only `pos` and pushed `snapshot` frames. Coin drops and messages appeared only in `snapshot`, so the implementation plan should assume no separate realtime coin/drop frame until later evidence proves otherwise.

Later validations are staged and should not be combined:

- 10-30 minute read-only canary after Commit 8.
- Short supervised movement-only run after Commit 11.
- Supervised non-combat profit run after Commit 12.
- Combat dry-run review after Commit 13.
- Short supervised live combat run after Commit 14.
- Systemd service restart/status check after Commit 16.

## Rollback Strategy

- Commits 1-8 are read-only or demo/probe infrastructure. They can be rolled back without affecting the browser bot.
- Commits 9-14 must keep live control behind config flags defaulting to off until each stage is validated.
- The browser bot build/release path remains separate. Browserless runner failures should not block browser bot emergency fixes.
- Every live-control canary must end with verified `leave`; if `leave` is not confirmed, the runner must raise a status alert and stop further control attempts.
