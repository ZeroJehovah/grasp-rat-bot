# Browserless Runner Operator Notes

This document tracks the production browserless runner surface. The older `headless-demo/` remains a protocol probe; the production entrypoint is `scripts/browserless-runner.js`.

## Current Scope

- The runner currently supports dry-run mode and a live read-only canary.
- Live read-only canary sends no movement or shoot commands. It runs pre-login snapshot safety, joins direct WS, collects frame health, and calls verified `leave`.
- The safety controller handles no-self, frame gap, stale self, WS close/error, stamina exhaustion, unsafe login point, direct leave failure, and explicit stop.
- The runner writes local JSONL logs and a persistent state file under the configured data directory.
- The status server and web panel are available for non-`--once` runs.

## Local Dry Run

```bash
node scripts/browserless-runner.js \
  --dry-run \
  --data-dir data/browserless-runner \
  --status-host 127.0.0.1 \
  --status-port 18767 \
  --web-token replace-with-a-secret
```

Open:

```text
http://127.0.0.1:18767/?token=replace-with-a-secret
```

For a bounded smoke that exits:

```bash
node scripts/browserless-runner.js --self-test
node scripts/browserless-runner.js --once --dry-run
```

## Read-Only Canary

The canary requires a reusable session and a known login point. The login point is verified again through direct `/snapshot` before the runner joins WS.
While the canary is connected, the dry-run decision adapter evaluates current state and writes throttled `decisions.jsonl` entries. It does not send movement or shoot commands.

```bash
node scripts/browserless-runner.js \
  --once \
  --live \
  --read-only \
  --data-dir data/browserless-runner \
  --user-id <user-id> \
  --session-token '<session-token>' \
  --login-point-x <x-cm> \
  --login-point-y <y-cm> \
  --login-point-hp <hp> \
  --decision-interval-ms 1000 \
  --read-only-probe-ms 1800000
```

For the first supervised validation, use 10-30 minutes for `--read-only-probe-ms`. The canary should end with verified `leave`; if leave is not confirmed, treat the run as failed and inspect `runner.jsonl`. Inspect `decisions.jsonl` to confirm combat candidates use realtime authority and snapshot coins appear only as fallback profit candidates.

During a supervised run, `POST /api/stop` or the panel Stop button requests an explicit safety stop. The runner records the event in `exits.jsonl` and should leave through the verified direct `leave` path.

## Status API

- `GET /` serves the built-in browserless runner panel.
- `GET /api/health` returns a simple local health response.
- `GET /api/status` returns redacted status and requires the configured web token.
- `POST /api/stop` is token-gated and requests an explicit safety stop through the safety/exit controller.

The token can be passed with `?token=...`, `x-web-token`, or `Authorization: Bearer ...`.

The status server refuses non-loopback hosts without a web token.

## State And Logs

Default layout:

```text
data/browserless-runner/
  state.json
  logs/
    YYYY-MM-DD/
      runner.jsonl
      decisions.jsonl
      combat.jsonl
      exits.jsonl
      summary.json
```

`state.json` may contain the manually authorized session token. Public status redacts secrets and reports only token presence.

Generate a day summary:

```bash
node scripts/browserless-log-summary.js \
  --log-dir data/browserless-runner/logs \
  --day YYYY-MM-DD \
  --write
```

## Environment

Important variables:

- `GRASP_RAT_BROWSERLESS_DATA_DIR`
- `GRASP_RAT_BROWSERLESS_STATUS_HOST`
- `GRASP_RAT_BROWSERLESS_STATUS_PORT`
- `GRASP_RAT_BROWSERLESS_WEB_TOKEN`
- `GRASP_RAT_BROWSERLESS_READ_ONLY`
- `GRASP_RAT_BROWSERLESS_DRY_RUN`
- `GRASP_RAT_BROWSERLESS_READONLY_PROBE_MS`
- `GRASP_RAT_BROWSERLESS_FRAME_GAP_ALERT_MS`
- `GRASP_RAT_BROWSERLESS_DECISION_INTERVAL_MS`
- `GRASP_RAT_BROWSERLESS_STALE_SELF_MS`
- `GRASP_RAT_BROWSERLESS_NO_SELF_GRACE_MS`
- `GRASP_RAT_BROWSERLESS_STAMINA_EXHAUSTED_BELOW_MS`
- `GRASP_RAT_BROWSERLESS_USER_ID`
- `GRASP_RAT_BROWSERLESS_SESSION_TOKEN`
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_X`
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y`
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP`

Full default values are listed in `docs/agent/config-defaults.md`.
