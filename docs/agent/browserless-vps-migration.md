# Browserless VPS Migration

This document is the durable handoff for migrating Grasp Rat operation away from a local browser-bound bot toward a browserless Linux VPS runner. Keep it updated when the authentication path, WebSocket protocol, headless runner behavior, validation status, or rollout plan changes.

The commit-by-commit product implementation sequence is tracked separately in `docs/agent/browserless-runner-development-plan.md`.

## Goal

Move the runtime-critical control loop to a remote Linux VPS so gameplay stability depends on the VPS network rather than the user's local browser machine. The long-term target is to preserve the existing bot's decision logic while replacing browser/CDP interaction with direct game transport calls wherever the game protocol allows it.

The first phase is intentionally a small probe under `headless-demo/`, not an unattended production bot. The production browserless runner should run as a real `systemd` service (`grasp-rat-browserless-runner`) rather than through `headless-demo/start-demo.sh`.

## Standing Constraints

- Do not use Codex/local automation to consume the user's live LinuxDO OAuth callback unless the user explicitly asks for that in the same turn.
- Login remains manually authorized by the user. The demo can request the LinuxDO authorize URL and accept user-provided callback data.
- Do not require snapshot or minimap polling for the first probe. The initial objective is to prove login, WebSocket connection, simple movement/fire commands, logging, and verified `leave`.
- `leave` must be verified with `leaveResponseConfirmsExitCore()` from `src/shared/leave-response.js`, matching the current bot's explicit exit confirmation logic.
- Any UI/API/log data shown back to the user must redact OAuth codes, session tokens, cookies, Cloudflare clearance values, and authorization headers.
- Keep this document updated during the migration so context compaction does not lose decisions, observed protocol details, or next steps.

## Current Demo Surface

- Server: `headless-demo/server.js`
- Operator docs: `headless-demo/README.md`
- Quick test launcher: `headless-demo/start-demo.sh`
- Optional systemd unit: `headless-demo/grasp-rat-headless-demo.service`
- Quick run command for the current VPS test flow:

```bash
./headless-demo/start-demo.sh
```

The launcher defaults to:

```bash
GRASP_RAT_DEMO_HOST=0.0.0.0 \
GRASP_RAT_DEMO_PORT=18766 \
GRASP_RAT_DEMO_WEB_TOKEN='1234567890' \
node headless-demo/server.js
```

The user's first VPS run used Node `v18.19.1`, which has global `fetch` but no global `WebSocket`. As of the next demo update, `headless-demo/server.js` keeps Node 22's global WebSocket path and falls back to the `ws` package on Node 18. Operators on Node 18 should run `npm install` after pulling the repo before starting the demo.

The web UI supports:

- Fetching the LinuxDO authorize URL from `GET/POST` flow against `${GAME_ORIGIN}/auth/linuxdo/start`.
- Accepting a fresh game callback URL, a direct `/?login=ok&user_id=...&token=...` URL, a compatible JSON payload, or a copied LinuxDO approve `curl`.
- Storing `userId` and session token in the demo state file on the VPS.
- Running a login-point snapshot probe without opening WS, using the stored token to test whether pre-login snapshot safety can be evaluated from the VPS.
- Opening the game WebSocket, running one explicit command sequence, then calling verified `leave`.
- Running a read-only WebSocket probe for a bounded duration, recording frame statistics, then calling verified `leave` without movement or shooting.
- Writing JSONL logs under the configured log directory.
- Showing a red page alert if `leave` is not explicitly confirmed.
- Reporting `authenticated` separately from `inGame`: `authenticated` means the demo has a reusable token, while `inGame` means the current demo WebSocket session is in the visible entity layer.
- Reporting `lastFrameSummary` and `lastCommandAck` from decoded WebSocket JSON so VPS checks can focus on frame type, tick, entity counts, self state, and command acknowledgements instead of large raw samples.
- Keeping `/api/status` compact: public status shows summaries, while complete frame metadata and full leave responses remain in JSONL logs.

## Observed Live Auth Flow

`https://grasp-rat-game.h-e.top/auth/linuxdo/start` returns JSON like:

```json
{
  "ok": true,
  "auth_url": "https://connect.linux.do/oauth2/authorize?response_type=code&client_id=...&redirect_uri=https%3A%2F%2Fgrasp-rat-game.h-e.top%2Fauth%2Flinuxdo%2Fcallback&scope=read"
}
```

After user approval, the game callback endpoint currently returns `200 text/html`, not JSON and not an HTTP 302. The body contains a meta refresh to the actual login URL:

```html
<meta http-equiv="refresh" content="0; url=/?login=ok&user_id=...&token=...&linux_do_id=...">
```

The demo must parse this HTML meta-refresh target and extract `user_id` plus `token`. As of commit `525b61f`, this path is implemented and token-bearing diagnostics are redacted before being returned through the demo UI/API.

OAuth callback codes are one-time use. The preferred operator input is a fresh unused:

```text
https://grasp-rat-game.h-e.top/auth/linuxdo/callback?code=...
```

If the browser would consume the callback before the user can copy it, the fallback is browser DevTools "Copy as cURL" for:

```text
https://connect.linux.do/oauth2/approve/...
```

The demo forwards that approval request with the copied cookies, reads only the redirect metadata/body needed to reach the game callback, then handles the game callback itself.

## Observed Game Transport

The current browser page mainly uses one WebSocket connection for gameplay once logged in. The observed path is:

```text
wss://grasp-rat-game.h-e.top/ws?user_id=<id>&token=<token>&compress=gzip%2Cdeflate
```

The first demo sends a deliberately limited action sequence:

- `vel 0 -1`
- `vel 0 0`
- `vel 0 1`
- `vel 0 0`
- `vel -1 0`
- `vel 0 0`
- `vel 1 0`
- `vel 0 0`
- `shoot 0 0 0 0`
- final `vel 0 0`
- verified HTTP `leave`

This sequence is only started by an explicit web button click.

Observed incoming WebSocket frames use a small binary envelope:

- Prefix bytes: ASCII `GRZ1`
- Version byte: `1`
- Payload: gzip-compressed JSON

Decoded frame types observed from the VPS run:

- `pos`: high-frequency realtime visible state with `tick`, `entities`, and `bullets`.
- `snapshot`: larger state frame delivered over the same WebSocket, with `total_entities`, `in_game`, `visible`, `occupied_cells`, `entities`, `bullets`, `coin_drops`, and `messages`.
- `shoot_ok`: command acknowledgement after `shoot 0 0 0 0`, including `bullet_id`, owner, start/target coordinates, direction, range, speed, and tick window.

Combat migration should consume realtime `pos` frames first. The pushed `snapshot` frame is useful as protocol evidence and potential non-combat fallback data, but combat target, aim, and fire decisions must continue to use realtime/native visible state rather than snapshot state.

## Validated Probe Result

On 2026-07-08, the VPS one-shot demo succeeded after the Node 18 `ws` fallback and `MessageEvent` frame handling fixes:

- LinuxDO callback login succeeded through the HTML meta-refresh path.
- Direct WebSocket connection used `wss://grasp-rat-game.h-e.top/ws?user_id=<id>&token=<token>&compress=gzip%2Cdeflate`.
- The demo sent the up/down/left/right/fire action sequence and then called `leave`.
- `leave` succeeded on the initial attempt with HTTP 200 in about 631ms.
- `leaveResponseConfirmsExitCore()` confirmed exit from the response summary: `leaveConfirmed: true`, `event: left`, `joined: UserRecordOnly`, `current_join_mode: None`, `life: Alive`, `visible: Hidden`.
- Recent WebSocket frames were binary/compressed samples beginning with `GRZ1` followed by a gzip-looking payload. This confirms the next protocol task is a headless frame decompressor/parser before any real strategy migration can depend on WS state.
- A later restart/manual authorization test ran the one-shot demo twice successfully. `leave` kept the session token usable, so repeat runs can reconnect with the stored token; this is expected because leaving the visible entity layer is not the same as clearing authentication.
- The decoded leave response after the repeat run confirmed `joined: UserRecordOnly`, `current_join_mode: None`, `visible: Hidden`, and `life: Alive`. This means `inGame` should become false after `leave`, while `authenticated`/legacy `loggedIn` remains true because the auth token is still present and reusable.
- The decoded `shoot_ok` acknowledgement proves the text command path is accepted by the direct WebSocket transport.
- After the structured-summary update was pulled to VPS and the demo was restarted, `/api/status` showed `lastCommandAck` for `shoot_ok` with bullet id, range, speed, and tick window. Recent `pos` frames initially included the self entity, and frames after `leave` no longer included self; this is consistent with leaving the visible entity layer.
- The same post-update status showed a pushed `snapshot` frame over WS, with 100 coin drops and 80 messages in that sample. This confirms snapshot data can arrive via the direct transport, but it remains non-combat/fallback evidence rather than a combat decision source.
- After the compact status update, the VPS process was restarted and the user ran the demo without reauthorizing. The stored token still connected successfully, `shoot_ok` was received, `leave` was confirmed on the initial attempt, and compact `recentFrames` showed `selfPresent` changing from `true` before leave to `false` after leave.
- A 30 second read-only probe observed 599 decoded binary frames with no decode errors: 569 `pos` frames and 30 pushed `snapshot` frames. The only key sets were `type,tick,entities,bullets` and `type,tick,total_entities,in_game,visible,occupied_cells,entities,bullets,coin_drops,messages`. This means no additional realtime coin/drop frame type has been observed yet; coin drops/messages are currently known only from pushed snapshots, so browserless combat must stay on `pos` and ordinary coin profit must treat snapshot coins as non-combat fallback data.
- A direct pre-WS snapshot probe against `https://grasp-rat-game.h-e.top/snapshot?user_id=<id>&token=<token>` returned HTTP 200 JSON without opening WS. The response shape matched pushed snapshot frames and included `total_entities`, `in_game`, `visible`, `occupied_cells`, `entities`, `bullets`, `coin_drops`, and `messages`; the sample had about 1.09MB text, 1001 entities, 1 bullet, 99 coin drops, and 80 messages. The first safety evaluation could not complete because the upgraded demo had no persisted `lastSelfSummary` login point from an earlier build. This is expected for pre-upgrade state; a fresh WS probe or demo run on the updated code should persist `lastSelfSummary`.
- A later snapshot safety probe with a persisted login point returned `ok:true` for the radius check, but its snapshot tick was lower than the latest known WS tick and it still showed self as `InGame`/`Active` after verified leave. Treat that result as stale evidence. Snapshot safety must include a cache-busting query parameter and reject responses whose `tick` is older than the latest known realtime WS tick.
- After adding cache-busting and freshness checks, a repeated snapshot safety probe returned fresh evidence: snapshot tick `1012158` vs latest known WS tick `1005191`, `selfPresent:false`, `freshness.ok:true`, and login-point safety `ok:true` with healthy 170m radius, 10 nearby entities, and 0 nearby Active entities. This validates the pre-login safety snapshot path for the browserless runner.

## Progress Log

- `09cf031`: Added the initial standalone VPS auth/control demo.
- `77a077f`: Improved callback diagnostics.
- `61fbfa8`: Added direct login URL / callback redirect handling.
- `e8083b5`: Added support for pasted LinuxDO approve `curl`.
- `525b61f`: Added parsing for callback HTML meta-refresh login URLs and stronger redaction of token-bearing diagnostics.
- 2026-07-08: Added Node 18 WebSocket fallback through the `ws` package after the first successful callback login hit `Node.js global WebSocket is unavailable` on VPS Node `v18.19.1`.
- 2026-07-08: Added `headless-demo/start-demo.sh` as the quick VPS test launcher with default host `0.0.0.0`, port `18766`, and token `1234567890`.
- 2026-07-08: VPS Node 18 plus `ws` emitted browser-style `MessageEvent` objects through `addEventListener`; frame recording now unwraps `.data`, handles Buffer/ArrayBuffer/TypedArray/object payloads defensively, and logs frame-recording errors instead of crashing the demo process.
- 2026-07-08: The one-shot VPS run completed successfully: callback login, WebSocket open, command send, compressed frame receipt, and verified leave all worked.
- 2026-07-08: Restart/manual authorization followed by two consecutive `run-demo` clicks both succeeded. The status model should distinguish cached authentication from active in-game presence.
- 2026-07-08: Frame logging was updated to keep binary metadata instead of lossy UTF-8 samples and to attempt `GRZ1` gzip decoding.
- 2026-07-08: VPS logs confirmed `GRZ1` version `1` gzip JSON frames. Decoded frame types include `pos`, `snapshot`, and `shoot_ok`; `leave` exits the visible entity layer but does not invalidate the reusable session token.
- 2026-07-08: Demo frame diagnostics were tightened to log structured summaries (`decodedType`, `decodedTick`, counts, self entity, command ack) instead of relying on large decoded JSON samples.
- 2026-07-08: A post-update VPS status check confirmed the structured summaries render in the UI/API. Public status was then compacted so large raw frame/base64 samples and full leave bodies stay in the log file instead of the page state blob.
- 2026-07-08: A no-reauthorization restart test passed: the persisted token survived demo process restart, direct WS reconnect worked, command ack was received, and verified leave returned `inGame` to false.
- 2026-07-08: The bounded read-only WS probe passed. Over 30 seconds, direct WS state consisted only of high-frequency `pos` frames and about 1Hz pushed `snapshot` frames; no separate realtime coin/drop frame type appeared.
- 2026-07-08: Direct pre-login `/snapshot?user_id=<id>&token=<token>` fetch from VPS worked before WS join. Safety verdict still needs one updated-code run to persist a login point first.
- 2026-07-08: Snapshot probe freshness guard added after a cached/stale-looking response returned an older tick and self `InGame` after leave. Pre-login safety now requires a non-stale snapshot tick.
- 2026-07-08: Fresh pre-login snapshot safety probe passed with cache-busting: direct `/snapshot` before WS join can evaluate the persisted login point and confirmed no nearby Active entity in the healthy-radius band.
- 2026-07-08: Shared `GRZ1` frame parsing was extracted into `src/shared/grz-frame.js` and the demo now uses it for gzip JSON parsing plus deterministic frame summaries. This is an implementation refactor over already validated protocol evidence; no new VPS validation was required.
- 2026-07-08: Reusable browserless Node session and leave clients were added under `src/node/browserless/`. The demo now delegates manual callback/direct-login/approve-curl parsing, secret redaction, timeout fetches, snapshot safety summaries, and verified HTTP `leave` retries to those modules while keeping demo-specific state and logging local. No new VPS validation was required because the transport behavior is unchanged.
- 2026-07-08: Browserless WebSocket transport and frame-stat modules were added under `src/node/browserless/`. The demo now delegates direct WS URL construction, Node 18/22 runtime selection, connect/open/close/error/message dispatch, narrow movement/shoot command sending, and read-only probe stats to those modules. No new VPS validation was required because the direct WS protocol and demo actions are unchanged.
- 2026-07-08: Browserless state-store support was added under `src/node/browserless/state-store.js`. Decoded `pos`, pushed `snapshot`, and `shoot_ok` frames now have a production-owned in-memory model with explicit realtime/snapshot/command authority tags. Combat-facing selection is realtime-only and self-tests verify snapshot-only coordinates do not enter combat state.
- 2026-07-08: Browserless local JSONL log storage, UTC-day retention, and summary generation were added. Normal browserless operation can now append redacted `runner`, `decisions`, `combat`, and `exits` streams locally, keep only the latest 3 UTC day directories, and generate per-day `summary.json` without depending on `combat-log-service`.
- 2026-07-08: The production browserless runner CLI skeleton was added at `scripts/browserless-runner.js` with config parsing under `src/node/browserless/config.js` and startup orchestration under `src/node/browserless/runner.js`. It initializes local logs/retention and supports read-only dry-run/fake once validation, but live read-only transport remains gated until the canary runner step adds verified leave.
- 2026-07-08: Browserless status server, web panel, and state-file helpers were added. Non-`--once` runner starts can now expose a token-gated `/api/status` and built-in panel backed by redacted `state.json`; `/api/stop` is present only as a placeholder until the safety/exit controller owns stop behavior.
- 2026-07-08: Read-only canary implementation was added under `src/node/browserless/canary.js` and wired into the runner's live read-only path. It checks pre-login snapshot safety before WS join, collects and decodes direct WS frames without sending movement/shoot commands, ingests state-store data, checks frame/self health, and calls verified `leave`. The 2026-07-08 production read-only VPS canary later passed audit under run id `read-only-20260708T142429656Z`.
- 2026-07-08: Browserless dry-run decision adapter was added under `src/node/browserless/decision-adapter.js` and wired into the read-only canary. It maps realtime `pos` self/entities into combat candidates, snapshot coin drops into non-combat fallback profit candidates, records browserless data gaps, writes throttled `decisions` JSONL entries, and updates status/panel decision rows without sending movement or shoot commands.
- 2026-07-08: Browserless safety controller was added under `src/node/browserless/safety-controller.js` and wired into the runner/status/canary path. It classifies no-self, WS close/error, frame gap, stale self, unsafe login point, stamina exhaustion, direct leave failure, and explicit stop; `/api/stop` now requests a controller-backed stop; unsafe read-only exits call verified `leave` through `leave-client.js`. The 2026-07-08 production forced-stop canary later passed audit under run id `read-only-20260708T145958570Z`.
- 2026-07-08: Browserless movement-only live mode was added behind `controlMode=movement-only` with `src/node/browserless/action-adapter.js`. The adapter only sends velocity commands toward snapshot coin fallback targets, sends stop pulses for wait/unsupported/reached states and before leave, tracks frame-based command settlement, and never sends shoot commands. The 2026-07-08 production movement-only canary later passed audit under run id `movement-only-20260708T151108072Z`.
- 2026-07-08: Browserless non-combat profit mode was added behind `controlMode=non-combat-profit`. The decision adapter now models realtime/native coin drops separately from snapshot fallback coins, chooses realtime/native coin profit first, blocks snapshot fallback while realtime profit or visible active threats exist, keeps combat targets diagnostic-only, and continues to send only velocity/stop commands through the action adapter. The 2026-07-08 production profit canary later passed audit under run id `non-combat-profit-20260708T151524293Z`.
- 2026-07-08: Browserless combat dry-run mode was added behind `controlMode=combat-dry-run`. `src/node/browserless/combat-adapter.js` maps realtime `pos` self/entities/bullets into existing target-selection, movement, and fire-discipline helpers plus a local dry-run aim summary; decisions and `combat.jsonl` entries show target authority, movement intent, aim mode, and suppressed shooting intent. The mode sends no movement or shoot commands and still ends through verified `leave`. This still needs a supervised VPS dry-run with visible Active-player evidence before guarded live combat work.
- 2026-07-08: Guarded browserless combat live mode was added behind `controlMode=combat-live` plus explicit `combatEnabled=true`. The action adapter now sends realtime combat velocity and paced `shoot targetX targetY startX startY` commands only when the combat adapter's range/reserve/fire-state gates allow shooting, records `shoot_ok` acknowledgement evidence in action state, and keeps normal verified `leave` and safety-stop paths. The default remains disabled and this still needs a supervised short VPS combat validation before any unattended live combat.
- 2026-07-08: Production supervisor/deployment files were added for the browserless runner. `deploy/browserless-runner.service` defines the `grasp-rat-browserless-runner` systemd unit, `deploy/browserless-runner.env.example` defines safe dry-run defaults and production paths, and `scripts/install-browserless-runner-service.sh` installs the unit/env surface without replacing an existing env file by default. Production state is under `/var/lib/grasp-rat-browserless`, JSONL logs are under `/var/log/grasp-rat-browserless`, and the service uses `/etc/grasp-rat/browserless-runner.env`. This still needs a VPS systemd install/restart/status validation.
- 2026-07-08: Production canary profile support and cutover docs were added. `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` / `--canary-profile` maps `read-only`, `movement-only`, `profit`, `combat-dry-run`, and `combat-live` to the existing staged control modes so VPS rollout can switch stages through env/config changes instead of code edits. The `combat-live` profile still requires explicit `combatEnabled=true` before shooting. Current architecture/state/test docs now record the browserless runner as a tracked Node runtime surface with production cutover pending accepted VPS canaries.
- 2026-07-08: Browserless canary evidence audit tooling was added at `scripts/browserless-canary-audit.js`. The command reads local JSONL logs for a UTC day and checks profile-specific acceptance evidence including snapshot safety, decoded frames, self observation, decisions, verified leave, explicit forced stop when requested, no forbidden movement/shoot behavior, realtime combat authority, combat dry-run suppression, and combat live acknowledgement evidence when shots are sent. This does not replace the pending VPS canaries; it gives those canaries a deterministic acceptance check once logs are available.
- 2026-07-08: Browserless deployment evidence audit tooling was added at `scripts/browserless-deployment-audit.js`. The command checks the installed `grasp-rat-browserless-runner` systemd unit, env file reference, runner entrypoint, restart policy, read/write paths, safe initial read-only dry-run env, non-placeholder web token, data/log directory access, and `systemctl is-enabled/is-active` state. The 2026-07-08 VPS deployment rerun later passed this audit after the runtime-directory installer fix.
- 2026-07-08: Browserless aggregate acceptance reporting was added at `scripts/browserless-acceptance-report.js`. It combines deployment, normal read-only, forced-stop, movement-only, profit, combat-dry-run, and combat-live audit results into one pass/fail cutover report. The canary audit now selects the latest clean finish for normal profile checks and explicit-stop evidence for forced-stop checks, so same-day staged runs can be reviewed together.
- 2026-07-08: VPS systemd validation exposed an installer gap: `grasp-rat-browserless-runner` failed with `status=226/NAMESPACE` because `/var/lib/grasp-rat-browserless` and `/var/log/grasp-rat-browserless` did not exist before systemd applied `ReadWritePaths`. The installer now creates both runtime directories, and deployment audit commands should run with `sudo` because `/etc/grasp-rat/browserless-runner.env` is intentionally `0640`.
- 2026-07-08: VPS systemd deployment validation passed after pulling `223551d` and rerunning `sudo scripts/install-browserless-runner-service.sh --install-env`. The service restarted as active, the installer reported both runtime directories, and `sudo node scripts/browserless-deployment-audit.js --fail-on-incomplete` returned `Browserless deployment audit: ok` with unit/env, read/write paths, safe dry-run/read-only env, non-placeholder web token, data/log directory access, enabled state, and active state all accepted.
- 2026-07-08: The first post-deployment service log review showed the runner intentionally remained in safe `dry-run` skeleton mode: `dryRun:true`, `controlMode:"read-only"`, `userId:0`, and `sessionTokenPresent:false`. It wrote `runner-start` and `runner-dry-run` only, produced no `decisions.jsonl`, and `browserless-canary-audit --profile read-only` was incomplete because no live WS canary ran. This is not a runtime failure; the next step is to populate production state with a reusable session/login point and configure `/etc/grasp-rat/browserless-runner.env` with `GRASP_RAT_BROWSERLESS_DRY_RUN=false` for the supervised read-only canary.
- 2026-07-08: Deployment env auditing was split into `--env-mode safe|live|any`. The initial deployment audit still defaults to safe dry-run/read-only checks; `--env-mode live` validates `DRY_RUN=false`, valid profile/control mode, and reusable session/login-point evidence from env or persisted state before supervised live canaries; the aggregate acceptance report passes deployment env mode `any` by default so final cutover review is not blocked just because the env legitimately moved out of safe dry-run for staged canaries.
- 2026-07-08: VPS evidence commands were aligned for production file permissions and live env changes. Canary audits should run with `sudo` when reading `/var/log/grasp-rat-browserless`, and post-live service-surface checks should use `sudo node scripts/browserless-deployment-audit.js --env-mode any --fail-on-incomplete` unless the operator is explicitly validating live readiness with `--env-mode live`.
- 2026-07-08: Deployment env auditing now rejects mismatched `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` and `GRASP_RAT_BROWSERLESS_CONTROL_MODE` pairs in safe/live/any modes. During staged VPS rollout, prefer changing only `GRASP_RAT_BROWSERLESS_CANARY_PROFILE`, or keep `CONTROL_MODE` matched to the profile mapping documented in the operator notes.
- 2026-07-08: Canary evidence auditing now scopes `decisions`, `combat`, `exits`, and `movement-command` evidence to the selected final event's `startedAt`/`completedAt` run window when available. This prevents same-day staged canaries from borrowing evidence across runs while preserving whole-day compatibility for older logs.
- 2026-07-08: Canary action evidence checks were tightened. Read-only and combat-dry-run audits now fail if scoped `movement-command` logs are present, while movement-only and profit audits require scoped movement-command evidence alongside positive velocity counters.
- 2026-07-08: Combat-live canary auditing now also requires scoped movement-command/action evidence alongside positive velocity counters, realtime combat logs, and shoot acknowledgement evidence when shots are sent.
- 2026-07-08: Canary shoot evidence auditing now reads scoped action logs as well as final counters. No-shoot profiles fail on leaked `action.shoot.command`, cumulative `state.shootSentCount`, or `state.lastShootCommand`; combat-live requires `lastShootAck` when either final counters or action logs prove a shot was sent.
- 2026-07-08: Aggregate acceptance reporting now prints each canary section's selected final event, run window, and key evidence counts in the human output, so final VPS cutover evidence can be checked without opening JSON first.
- 2026-07-08: Canary runs now stamp runner, decision, action, combat, and exit JSONL entries with a stable `runId`. `browserless-canary-audit` prefers exact run-id correlation before falling back to `startedAt`/`completedAt` windows for older logs, and aggregate acceptance summaries print the selected run id.
- 2026-07-08: Combat canary auditing now requires target evidence. A combat-dry-run or combat-live profile must include at least one scoped realtime combat target entry; targetless diagnostic rows no longer satisfy acceptance. Aggregate acceptance summaries now print combat target counts.
- 2026-07-08: A supervised live-readiness attempt on VPS failed before canary start because the checkout did not yet contain deployment audit `--env-mode` support (`unknown argument: --env-mode`). This is not canary evidence. Before live canaries, pull `origin/main`, verify `node scripts/browserless-deployment-audit.js --help | grep -- '--env-mode'`, and only restart the service after `sudo node scripts/browserless-deployment-audit.js --env-mode live --fail-on-incomplete` passes.
- 2026-07-08: After pulling `5f7f812`, VPS live-readiness audit reached the intended checks and correctly blocked live canary start because the env still had `GRASP_RAT_BROWSERLESS_DRY_RUN=true`, `GRASP_RAT_BROWSERLESS_USER_ID=0`, and no session token. The audit also exposed that empty login-point fields were accepted as numeric zero locally; Commit 31 fixes that so `--env-mode live` requires explicit X/Y/HP values before restart.
- 2026-07-08: VPS inspection found reusable legacy demo state at `headless-demo/data/state.json` with user id present, token present, and a last self/login point. Production browserless state can now be populated with `scripts/browserless-import-state.js --from headless-demo/data/state.json --to /var/lib/grasp-rat-browserless/state.json --source headless-demo`, and the runner/deployment audit hydrate live session/login-point readiness from that state when env values are blank. This avoids copying `USER_ID`, `SESSION_TOKEN`, or login-point coordinates into `/etc/grasp-rat/browserless-runner.env`.
- 2026-07-08: The status server now exposes token-gated auth helper endpoints: `POST /api/auth-url` requests the LinuxDO authorize URL, and `POST /api/callback` accepts a game callback URL or compatible login payload and stores the resulting session in production state without returning the token. This remains manual authorization; it just moves the session extraction into the runner.
- 2026-07-08: Read-only runs without a login point may perform a bootstrap pass only to learn realtime self coordinates. Canary acceptance still requires a subsequent formal snapshot-safety run, and `browserless-canary-audit` rejects bootstrap-only final events as accepted evidence.
- 2026-07-08: The production read-only canary accepted on VPS after pulling `c561b8e`, importing state-backed session/login-point evidence, and running `GRASP_RAT_BROWSERLESS_DRY_RUN=false` with `GRASP_RAT_BROWSERLESS_CANARY_PROFILE=read-only`. `sudo node scripts/browserless-canary-audit.js --profile read-only --fail-on-incomplete` selected run id `read-only-20260708T142429656Z`, window `2026-07-08T14:24:29.656Z .. 2026-07-08T14:34:32.273Z`, and passed with 11987 decoded frames, 11987 self-observed frames, 0 decode errors, verified `leave`, 585 decisions, 0 movement commands, and 0 shoot commands. The same service surface passed `sudo node scripts/browserless-deployment-audit.js --env-mode any --fail-on-incomplete`.
- 2026-07-08: The forced-stop read-only canary accepted on VPS after restarting the live read-only service and triggering `/api/stop` through the status API. `sudo node scripts/browserless-canary-audit.js --profile read-only --require-stop --fail-on-incomplete` selected run id `read-only-20260708T145958570Z`, window `2026-07-08T14:59:58.570Z .. 2026-07-08T15:00:59.352Z`, and passed with 1 explicit-stop event, verified `leave`, 1189 decoded frames, 1189 self-observed frames, 0 decode errors, 59 decisions, 0 movement commands, and 0 shoot commands.
- 2026-07-08: The movement-only canary accepted on VPS after switching the production service to `GRASP_RAT_BROWSERLESS_CANARY_PROFILE=movement-only` for a 60 second supervised window. `sudo node scripts/browserless-canary-audit.js --profile movement-only --fail-on-incomplete` selected run id `movement-only-20260708T151108072Z`, window `2026-07-08T15:11:08.072Z .. 2026-07-08T15:12:10.382Z`, and passed with snapshot safety, 1213 decoded frames, 1212 self-observed frames, 0 decode errors, verified `leave`, 59 decisions, 60 velocity/movement-command entries, command settlement, and 0 shoot commands. The same service surface passed `sudo node scripts/browserless-deployment-audit.js --env-mode any --fail-on-incomplete`.
- 2026-07-08: The non-combat profit canary accepted on VPS after switching the production service to `GRASP_RAT_BROWSERLESS_CANARY_PROFILE=profit` for a 60 second supervised window. `sudo node scripts/browserless-canary-audit.js --profile profit --fail-on-incomplete` selected run id `non-combat-profit-20260708T151524293Z`, window `2026-07-08T15:15:24.293Z .. 2026-07-08T15:16:26.489Z`, and passed with snapshot safety, 1212 decoded frames, 1211 self-observed frames, 0 decode errors, verified `leave`, 59 profit decisions, 60 velocity/movement-command entries, and 0 shoot commands. Additional decision-log review found 58 visible coin actions, 1 wait while realtime self was missing, and 0 combat actions. The same service surface passed `sudo node scripts/browserless-deployment-audit.js --env-mode any --fail-on-incomplete`.
- 2026-07-08: A combat-dry-run attempt with run id `combat-dry-run-20260708T152147589Z` cleanly finished after a 10 minute supervised window with verified `leave`, 11982 decoded/self-observed frames, 584 dry-run combat diagnostic rows, and 0 movement/shoot commands. It had 0 realtime combat targets/candidates, so it is not accepted Commit 14 evidence. Future combat canary attempts should use 2 minute windows and actively move/search toward snapshot-located Active players before starting the dry-run acceptance window.
- 2026-07-09: `controlMode=profit-live` was added as an explicit formal-run mode for ordinary coins plus visible AFK targets. The staged `profit` canary profile still maps to `non-combat-profit` and keeps its no-shoot audit contract. `profit-live` blocks AFK profit when a visible Active threat is present and does not replace the required `combat-live` validation for Active-player combat.

## Next Plan

1. Pull the latest browserless runner code to the VPS and rerun 2 minute movement-only/profit canaries after the velocity command quantization fix. In addition to the audit output, inspect self-position deltas so movement is proven, not only command emission.
2. Use `/snapshot` only to locate an Active player and guide safe movement/search; then run a 2 minute supervised `controlMode=combat-dry-run` VPS validation once the target is realtime-visible. Inspect `combat.jsonl`/`decisions.jsonl` for realtime-only targets, aim/fire summaries, suppressed commands, and verified `leave`; then audit with `--profile combat-dry-run`.
3. Run a 2 minute supervised `controlMode=combat-live` plus `combatEnabled=true` VPS validation and inspect `combat.jsonl`, `runner.jsonl`, status action rows, scoped movement-command evidence, `shoot_ok` acknowledgement evidence, command pacing, and verified `leave`; then audit with `--profile combat-live`.
4. After all staged canaries have accepted evidence, run `sudo node scripts/browserless-acceptance-report.js --log-dir /var/log/grasp-rat-browserless --day YYYY-MM-DD --fail-on-incomplete`; confirm the printed run ids/final events/run windows/counts match the intended staged runs, then keep its output with the cutover handoff.
5. Use `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` for subsequent staged canaries so the production service can move through read-only, movement-only, profit, combat dry-run, and combat live without code edits. Use explicit `GRASP_RAT_BROWSERLESS_CONTROL_MODE=profit-live` only for formal profit operation, not for the `profit` canary acceptance audit.
6. Keep the browserless runtime boundary explicit:
   - shared pure strategy remains in `src/strategy/`;
   - browser DOM/CDP integration remains browser-specific;
   - a new Node transport/runtime adapter can own auth/session state, direct WebSocket IO, timers, and verified exit.
7. Mark `headless-demo/` superseded only after the production runner canaries and aggregate acceptance report above have accepted evidence; until then it remains a diagnostic protocol probe.

## Evidence To Request From VPS Runs

When the user reports a failure, ask for only the relevant outputs and keep secrets redacted:

```bash
sudo journalctl -u grasp-rat-browserless-runner -n 120 --no-pager
sudo find /var/log/grasp-rat-browserless/$(date -u +%F) -maxdepth 1 -type f -name '*.jsonl' -print
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/runner.jsonl
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/decisions.jsonl
sudo node scripts/browserless-deployment-audit.js --env-mode any --fail-on-incomplete
```

For combat stages, also ask for:

```bash
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/combat.jsonl
```

For forced-stop or leave failures, also ask for:

```bash
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/exits.jsonl
sudo node scripts/browserless-canary-audit.js --log-dir /var/log/grasp-rat-browserless --day $(date -u +%F) --profile read-only --require-stop --fail-on-incomplete
```

For normal profile acceptance, ask the operator to run the matching audit command, for example:

```bash
sudo node scripts/browserless-canary-audit.js --log-dir /var/log/grasp-rat-browserless --day $(date -u +%F) --profile read-only --fail-on-incomplete
```

For final cutover readiness, ask for:

```bash
sudo node scripts/browserless-acceptance-report.js --log-dir /var/log/grasp-rat-browserless --day $(date -u +%F) --fail-on-incomplete
```

If `headless-demo/` is being used only as a diagnostic probe, the log path shown in its `/api/status` remains authoritative for that probe.
