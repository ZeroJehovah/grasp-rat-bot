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

## Next Plan

1. Extract the browserless WebSocket transport from the demo into `src/node/browserless/ws-transport.js`, keeping the command send surface narrow.
2. Define the browserless runtime boundary:
   - shared pure strategy remains in `src/strategy/`;
   - browser DOM/CDP integration remains browser-specific;
   - a new Node transport/runtime adapter can own auth/session state, direct WebSocket IO, timers, and verified exit.
3. Migrate strategy execution conservatively, starting with non-combat or low-risk actions before direct combat logic.
4. Add replay/static tests for any shared protocol parser or transport adapter before using it for long-running unattended operation.

## Evidence To Request From VPS Runs

When the user reports a failure, ask for only the relevant outputs and keep secrets redacted:

```bash
tail -n 200 headless-demo/data/logs/$(date -u +%F).jsonl
```

If the demo is running as systemd later:

```bash
sudo journalctl -u grasp-rat-headless-demo -n 120 --no-pager
sudo tail -n 200 /var/log/grasp-rat-headless-demo/$(date -u +%F).jsonl
```

For the current manual process, the log path shown in `/api/status` is authoritative.

For the next protocol validation, ask for `/api/status` fields:

- `lastSnapshotProbe`
- `lastSelfSummary`
- `lastError`

For read-only WS validation, ask for:

- `lastProbe`
- `lastFrameSummary`
- `recentFrames` last 2 entries
- `lastLeaveSummary`
