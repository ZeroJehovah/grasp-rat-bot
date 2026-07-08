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
- 2026-07-08: Read-only canary implementation was added under `src/node/browserless/canary.js` and wired into the runner's live read-only path. It checks pre-login snapshot safety before WS join, collects and decodes direct WS frames without sending movement/shoot commands, ingests state-store data, checks frame/self health, and calls verified `leave`. This still needs the staged 10-30 minute VPS canary run before Commit 9 can be marked fully complete.
- 2026-07-08: Browserless dry-run decision adapter was added under `src/node/browserless/decision-adapter.js` and wired into the read-only canary. It maps realtime `pos` self/entities into combat candidates, snapshot coin drops into non-combat fallback profit candidates, records browserless data gaps, writes throttled `decisions` JSONL entries, and updates status/panel decision rows without sending movement or shoot commands.
- 2026-07-08: Browserless safety controller was added under `src/node/browserless/safety-controller.js` and wired into the runner/status/canary path. It classifies no-self, WS close/error, frame gap, stale self, unsafe login point, stamina exhaustion, direct leave failure, and explicit stop; `/api/stop` now requests a controller-backed stop; unsafe read-only exits call verified `leave` through `leave-client.js`. This still needs a supervised VPS read-only canary with forced `/api/stop` to validate the status stop path against the live service.
- 2026-07-08: Browserless movement-only live mode was added behind `controlMode=movement-only` with `src/node/browserless/action-adapter.js`. The adapter only sends velocity commands toward snapshot coin fallback targets, sends stop pulses for wait/unsupported/reached states and before leave, tracks frame-based command settlement, and never sends shoot commands. This still needs a supervised short VPS movement-only validation before non-combat profit behavior can be promoted.
- 2026-07-08: Browserless non-combat profit mode was added behind `controlMode=non-combat-profit`. The decision adapter now models realtime/native coin drops separately from snapshot fallback coins, chooses realtime/native coin profit first, blocks snapshot fallback while realtime profit or visible active threats exist, keeps combat targets diagnostic-only, and continues to send only velocity/stop commands through the action adapter. This still needs supervised VPS profit logs before any default enablement.
- 2026-07-08: Browserless combat dry-run mode was added behind `controlMode=combat-dry-run`. `src/node/browserless/combat-adapter.js` maps realtime `pos` self/entities/bullets into existing target-selection, movement, and fire-discipline helpers plus a local dry-run aim summary; decisions and `combat.jsonl` entries show target authority, movement intent, aim mode, and suppressed shooting intent. The mode sends no movement or shoot commands and still ends through verified `leave`. This still needs a supervised VPS dry-run with visible Active-player evidence before guarded live combat work.
- 2026-07-08: Guarded browserless combat live mode was added behind `controlMode=combat-live` plus explicit `combatEnabled=true`. The action adapter now sends realtime combat velocity and paced `shoot targetX targetY startX startY` commands only when the combat adapter's range/reserve/fire-state gates allow shooting, records `shoot_ok` acknowledgement evidence in action state, and keeps normal verified `leave` and safety-stop paths. The default remains disabled and this still needs a supervised short VPS combat validation before any unattended live combat.
- 2026-07-08: Production supervisor/deployment files were added for the browserless runner. `deploy/browserless-runner.service` defines the `grasp-rat-browserless-runner` systemd unit, `deploy/browserless-runner.env.example` defines safe dry-run defaults and production paths, and `scripts/install-browserless-runner-service.sh` installs the unit/env surface without replacing an existing env file by default. Production state is under `/var/lib/grasp-rat-browserless`, JSONL logs are under `/var/log/grasp-rat-browserless`, and the service uses `/etc/grasp-rat/browserless-runner.env`. This still needs a VPS systemd install/restart/status validation.
- 2026-07-08: Production canary profile support and cutover docs were added. `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` / `--canary-profile` maps `read-only`, `movement-only`, `profit`, `combat-dry-run`, and `combat-live` to the existing staged control modes so VPS rollout can switch stages through env/config changes instead of code edits. The `combat-live` profile still requires explicit `combatEnabled=true` before shooting. Current architecture/state/test docs now record the browserless runner as a tracked Node runtime surface with production cutover pending accepted VPS canaries.
- 2026-07-08: Browserless canary evidence audit tooling was added at `scripts/browserless-canary-audit.js`. The command reads local JSONL logs for a UTC day and checks profile-specific acceptance evidence including snapshot safety, decoded frames, self observation, decisions, verified leave, explicit forced stop when requested, no forbidden movement/shoot behavior, realtime combat authority, combat dry-run suppression, and combat live acknowledgement evidence when shots are sent. This does not replace the pending VPS canaries; it gives those canaries a deterministic acceptance check once logs are available.

## Next Plan

1. Run the production browserless read-only canary on VPS for 10-30 minutes and inspect status/log evidence, including `decisions.jsonl`; then run `node scripts/browserless-canary-audit.js --log-dir /var/log/grasp-rat-browserless --day YYYY-MM-DD --profile read-only --fail-on-incomplete`.
2. During a supervised read-only service run, trigger forced `/api/stop` and verify it ends with confirmed `leave`; then run the same audit with `--require-stop`.
3. Run a supervised short `controlMode=movement-only` VPS validation and inspect `runner.jsonl`, `decisions.jsonl`, status action rows, command settlement, and verified `leave`; then audit with `--profile movement-only`.
4. Run a supervised `controlMode=non-combat-profit` VPS validation and inspect profit decisions for realtime-first behavior, guarded snapshot fallback, no shoot commands, and verified `leave`; then audit with `--profile profit`.
5. Run a supervised `controlMode=combat-dry-run` VPS validation under visible Active-player conditions and inspect `combat.jsonl`/`decisions.jsonl` for realtime-only targets, aim/fire summaries, suppressed commands, and verified `leave`; then audit with `--profile combat-dry-run`.
6. Run a supervised short `controlMode=combat-live` plus `combatEnabled=true` VPS validation and inspect `combat.jsonl`, `runner.jsonl`, status action rows, `shoot_ok` acknowledgement evidence, command pacing, and verified `leave`; then audit with `--profile combat-live`.
7. Install the `grasp-rat-browserless-runner` systemd service on VPS, verify env/data/log paths, start in dry-run/read-only safe mode, and inspect `systemctl status` plus `journalctl -u grasp-rat-browserless-runner`.
8. Use `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` for subsequent staged canaries so the production service can move through read-only, movement-only, profit, combat dry-run, and combat live without code edits.
9. Keep the browserless runtime boundary explicit:
   - shared pure strategy remains in `src/strategy/`;
   - browser DOM/CDP integration remains browser-specific;
   - a new Node transport/runtime adapter can own auth/session state, direct WebSocket IO, timers, and verified exit.
10. Mark `headless-demo/` superseded only after the production runner canaries and systemd validation above have accepted evidence; until then it remains a diagnostic protocol probe.

## Evidence To Request From VPS Runs

When the user reports a failure, ask for only the relevant outputs and keep secrets redacted:

```bash
sudo journalctl -u grasp-rat-browserless-runner -n 120 --no-pager
sudo find /var/log/grasp-rat-browserless/$(date -u +%F) -maxdepth 1 -type f -name '*.jsonl' -print
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/runner.jsonl
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/decisions.jsonl
```

For combat stages, also ask for:

```bash
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/combat.jsonl
```

For forced-stop or leave failures, also ask for:

```bash
sudo tail -n 120 /var/log/grasp-rat-browserless/$(date -u +%F)/exits.jsonl
node scripts/browserless-canary-audit.js --log-dir /var/log/grasp-rat-browserless --day $(date -u +%F) --profile read-only --require-stop
```

For normal profile acceptance, ask the operator to run the matching audit command, for example:

```bash
node scripts/browserless-canary-audit.js --log-dir /var/log/grasp-rat-browserless --day $(date -u +%F) --profile read-only --fail-on-incomplete
```

If `headless-demo/` is being used only as a diagnostic probe, the log path shown in its `/api/status` remains authoritative for that probe.
