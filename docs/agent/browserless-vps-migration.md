# Browserless VPS Migration

This document is the durable handoff for migrating Grasp Rat operation away from a local browser-bound bot toward a browserless Linux VPS runner. Keep it updated when the authentication path, WebSocket protocol, headless runner behavior, validation status, or rollout plan changes.

## Goal

Move the runtime-critical control loop to a remote Linux VPS so gameplay stability depends on the VPS network rather than the user's local browser machine. The long-term target is to preserve the existing bot's decision logic while replacing browser/CDP interaction with direct game transport calls wherever the game protocol allows it.

The first phase is intentionally a small probe under `headless-demo/`, not an unattended production bot.

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
- Opening the game WebSocket, running one explicit command sequence, then calling verified `leave`.
- Writing JSONL logs under the configured log directory.
- Showing a red page alert if `leave` is not explicitly confirmed.

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

## Progress Log

- `09cf031`: Added the initial standalone VPS auth/control demo.
- `77a077f`: Improved callback diagnostics.
- `61fbfa8`: Added direct login URL / callback redirect handling.
- `e8083b5`: Added support for pasted LinuxDO approve `curl`.
- `525b61f`: Added parsing for callback HTML meta-refresh login URLs and stronger redaction of token-bearing diagnostics.
- 2026-07-08: Added Node 18 WebSocket fallback through the `ws` package after the first successful callback login hit `Node.js global WebSocket is unavailable` on VPS Node `v18.19.1`.
- 2026-07-08: Added `headless-demo/start-demo.sh` as the quick VPS test launcher with default host `0.0.0.0`, port `18766`, and token `1234567890`.

## Next Plan

1. Run the fixed demo once on the VPS with a fresh unused callback URL.
2. Collect the JSON result and the relevant JSONL log lines if login, WebSocket connect, demo action, or leave verification fails.
3. Confirm WebSocket frame shape and command acceptance from the VPS logs.
4. Once the one-shot probe is stable, define the browserless runtime boundary:
   - shared pure strategy remains in `src/strategy/`;
   - browser DOM/CDP integration remains browser-specific;
   - a new Node transport/runtime adapter can own auth/session state, direct WebSocket IO, timers, and verified exit.
5. Migrate strategy execution conservatively, starting with non-combat or low-risk actions before direct combat logic.
6. Add replay/static tests for any shared protocol parser or transport adapter before using it for long-running unattended operation.

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
