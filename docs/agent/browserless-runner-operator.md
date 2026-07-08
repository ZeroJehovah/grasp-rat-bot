# Browserless Runner Operator Notes

This document tracks the production browserless runner surface. The older `headless-demo/` remains a protocol probe; the production entrypoint is `scripts/browserless-runner.js`.

## Current Scope

- The runner currently supports a dry-run/read-only skeleton.
- Live read-only transport is intentionally gated until the read-only canary runner step is implemented.
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

## Status API

- `GET /` serves the built-in browserless runner panel.
- `GET /api/health` returns a simple local health response.
- `GET /api/status` returns redacted status and requires the configured web token.
- `POST /api/stop` is token-gated and currently a placeholder until the safety/exit controller owns stop behavior.

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
- `GRASP_RAT_BROWSERLESS_USER_ID`
- `GRASP_RAT_BROWSERLESS_SESSION_TOKEN`

Full default values are listed in `docs/agent/config-defaults.md`.
