# Browserless Runner Operator Notes

This document tracks the production browserless runner surface. The older `headless-demo/` remains a protocol probe; the production entrypoint is `scripts/browserless-runner.js`.

## Current Scope

- The runner currently supports dry-run mode, a live read-only canary, supervised movement-only mode, supervised non-combat profit mode, combat dry-run mode, and explicit guarded combat live mode.
- Live read-only canary sends no movement or shoot commands. It runs pre-login snapshot safety, joins direct WS, collects frame health, and calls verified `leave`.
- Movement-only mode sends velocity commands only toward snapshot coin fallback targets, never sends shoot commands, and remains supervised-validation-only.
- Non-combat profit mode prefers realtime/native coin drops when present, uses snapshot coins only as guarded fallback, and keeps combat targets diagnostic-only.
- Combat dry-run mode evaluates realtime `pos` combat target, movement, aim, and fire intent, writes `combat.jsonl`, and still sends no movement or shoot commands.
- Combat live mode is default-off and requires both `--combat-live` and `--combat-enabled`; it sends realtime combat movement and paced shoot commands only when combat gates allow shooting.
- The safety controller handles no-self, frame gap, stale self, WS close/error, stamina exhaustion, unsafe login point, direct leave failure, and explicit stop.
- The runner writes local JSONL logs and a persistent state file under the configured data directory.
- The status server and web panel are available for non-`--once` runs.
- Production service files live under `deploy/`; the service name is `grasp-rat-browserless-runner`.

## Production Service

Install or refresh the systemd unit from the repo:

```bash
sudo scripts/install-browserless-runner-service.sh --install-env
```

The installer writes:

- service unit: `/etc/systemd/system/grasp-rat-browserless-runner.service`
- env file: `/etc/grasp-rat/browserless-runner.env`
- runtime directories: `/var/lib/grasp-rat-browserless` and `/var/log/grasp-rat-browserless`

The unit uses:

- executable: `/usr/bin/env node scripts/browserless-runner.js`
- app directory: the current repo path at install time
- data dir: `/var/lib/grasp-rat-browserless`
- log dir: `/var/log/grasp-rat-browserless`
- env file: `/etc/grasp-rat/browserless-runner.env`

The installed env example defaults to dry-run read-only mode. This proves the service/deployment surface but does not connect to live WS, does not write `decisions.jsonl`, and does not satisfy canary acceptance. Edit `/etc/grasp-rat/browserless-runner.env` before live canaries: set `GRASP_RAT_BROWSERLESS_DRY_RUN=false`, a long `GRASP_RAT_BROWSERLESS_WEB_TOKEN`, manual session values, login-point coordinates, and the intended `GRASP_RAT_BROWSERLESS_CONTROL_MODE`.

For staged rollout, prefer `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` or `--canary-profile` over editing mode-specific command lines. Profiles map to existing modes:

- `read-only` -> `controlMode=read-only`
- `movement-only` -> `controlMode=movement-only`
- `profit` -> `controlMode=non-combat-profit`
- `combat-dry-run` -> `controlMode=combat-dry-run`
- `combat-live` -> `controlMode=combat-live`

The `combat-live` profile does not enable live shooting by itself; `GRASP_RAT_BROWSERLESS_COMBAT_ENABLED=true` or `--combat-enabled` is still required.

Standard controls:

```bash
sudo systemctl start grasp-rat-browserless-runner
sudo systemctl stop grasp-rat-browserless-runner
sudo systemctl restart grasp-rat-browserless-runner
sudo systemctl status grasp-rat-browserless-runner
sudo journalctl -u grasp-rat-browserless-runner -n 120 --no-pager
```

After installing and starting the service in safe read-only dry-run mode, audit the deployment evidence:

```bash
sudo node scripts/browserless-deployment-audit.js --fail-on-incomplete
```

The audit checks the installed unit, env path, runner entrypoint, safe read-only dry-run defaults, non-placeholder status token, data/log directory access, and `systemctl is-enabled/is-active` state. Use `--skip-systemctl` only for static file/directory checks.

Before switching a supervised live canary on, audit the live env shape:

```bash
sudo node scripts/browserless-deployment-audit.js --env-mode live --fail-on-incomplete
```

`--env-mode live` expects `GRASP_RAT_BROWSERLESS_DRY_RUN=false`, a valid canary/control mode, manual session values, and login-point coordinates. The aggregate acceptance report uses deployment env mode `any` by default so it can run after the service has legitimately moved through live staged profiles.

The status panel remains token-gated at the configured host/port. Emergency stop is available through the panel Stop button or:

```bash
curl -X POST 'http://127.0.0.1:18767/api/stop?token=<web-token>'
```

`headless-demo/start-demo.sh` is only a diagnostic protocol probe after this point; production operation should use `grasp-rat-browserless-runner`.

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

For service-based validation, configure `/etc/grasp-rat/browserless-runner.env` with `GRASP_RAT_BROWSERLESS_DRY_RUN=false`, `GRASP_RAT_BROWSERLESS_CANARY_PROFILE=read-only`, `GRASP_RAT_BROWSERLESS_USER_ID`, `GRASP_RAT_BROWSERLESS_SESSION_TOKEN`, and the three login-point values, then restart `grasp-rat-browserless-runner`.

```bash
node scripts/browserless-runner.js \
  --once \
  --live \
  --canary-profile read-only \
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

## Movement-Only Validation

Movement-only mode uses the same pre-login safety and verified leave path, but enables velocity commands. Use short supervised runs first.

```bash
node scripts/browserless-runner.js \
  --once \
  --live \
  --canary-profile movement-only \
  --data-dir data/browserless-runner \
  --user-id <user-id> \
  --session-token '<session-token>' \
  --login-point-x <x-cm> \
  --login-point-y <y-cm> \
  --login-point-hp <hp> \
  --decision-interval-ms 1000 \
  --movement-command-interval-ms 500 \
  --movement-target-dead-zone-cm 900 \
  --movement-settlement-frames 2 \
  --read-only-probe-ms 60000
```

Inspect `runner.jsonl` for `movement-command` entries and final verified `leave`. Inspect status action rows for command settlement. Any `shoot` command in logs or transport evidence is a release blocker.

## Non-Combat Profit Validation

Non-combat profit mode uses velocity commands to move toward coin profit only. It should not chase or shoot active-player combat targets.

```bash
node scripts/browserless-runner.js \
  --once \
  --live \
  --canary-profile profit \
  --data-dir data/browserless-runner \
  --user-id <user-id> \
  --session-token '<session-token>' \
  --login-point-x <x-cm> \
  --login-point-y <y-cm> \
  --login-point-hp <hp> \
  --decision-interval-ms 1000 \
  --movement-command-interval-ms 500 \
  --movement-target-dead-zone-cm 900 \
  --movement-settlement-frames 2 \
  --read-only-probe-ms 60000
```

Review `decisions.jsonl` before considering longer runs. Expected evidence: realtime/native coin candidates win when present; snapshot fallback appears only when no realtime profit and no visible Active threat is blocking fallback; combat targets may appear in diagnostic rows but must not become action commands.

## Combat Dry-Run Validation

Combat dry-run uses the same pre-login safety and verified leave path, but only evaluates combat intent from realtime `pos` frames. It does not send movement or shoot commands.

```bash
node scripts/browserless-runner.js \
  --once \
  --live \
  --canary-profile combat-dry-run \
  --data-dir data/browserless-runner \
  --user-id <user-id> \
  --session-token '<session-token>' \
  --login-point-x <x-cm> \
  --login-point-y <y-cm> \
  --login-point-hp <hp> \
  --decision-interval-ms 1000 \
  --read-only-probe-ms 60000
```

Review `combat.jsonl` and `decisions.jsonl` before enabling any guarded live combat work. Expected evidence: combat targets have `authority: "realtime"`, snapshot-only targets never appear as combat targets, aim summaries include `exact` or `linear-intercept`, shooting rows say `dryRunOnly: true` and `commandSuppressed: true`, and there are no velocity or shoot commands.

## Guarded Combat Live Validation

Combat live mode uses the same pre-login safety and verified leave path, but it can send velocity and shoot commands. It is unavailable by default: `--combat-live` selects the mode, and `--combat-enabled` is the separate live-control confirmation.

```bash
node scripts/browserless-runner.js \
  --once \
  --live \
  --canary-profile combat-live \
  --combat-enabled \
  --data-dir data/browserless-runner \
  --user-id <user-id> \
  --session-token '<session-token>' \
  --login-point-x <x-cm> \
  --login-point-y <y-cm> \
  --login-point-hp <hp> \
  --decision-interval-ms 1000 \
  --movement-command-interval-ms 500 \
  --movement-settlement-frames 2 \
  --combat-shoot-min-interval-ms 160 \
  --read-only-probe-ms 60000
```

Run only under direct supervision. Expected evidence: `combat.jsonl` entries use realtime authority, `runner.jsonl` action rows show combat movement and shoot command pacing, status action state shows `shootSentCount` and the latest `shoot_ok` acknowledgement when the server accepts a shot, and the run ends with verified `leave`. Any missing leave confirmation is a failed validation.

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

Production service layout:

```text
/var/lib/grasp-rat-browserless/
  state.json

/var/log/grasp-rat-browserless/
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
  --log-dir /var/log/grasp-rat-browserless \
  --day YYYY-MM-DD \
  --write
```

Audit canary evidence after a VPS run:

```bash
sudo node scripts/browserless-canary-audit.js \
  --log-dir /var/log/grasp-rat-browserless \
  --day YYYY-MM-DD \
  --profile read-only \
  --fail-on-incomplete
```

Use `--profile movement-only`, `--profile profit`, `--profile combat-dry-run`, or `--profile combat-live` for later stages. For the forced `/api/stop` validation, add `--require-stop`; that mode accepts an explicit-stop safety exit only when verified `leave` evidence is present. Use `sudo` for production logs under `/var/log/grasp-rat-browserless`.

After all staged canaries and the deployment audit have run, generate the aggregate cutover readiness report:

```bash
sudo node scripts/browserless-acceptance-report.js \
  --log-dir /var/log/grasp-rat-browserless \
  --day YYYY-MM-DD \
  --fail-on-incomplete
```

This report aggregates deployment, normal read-only, forced-stop, movement-only, profit, combat dry-run, and combat live audit results. Run it with `sudo` because the included deployment audit reads the protected env file. It is the final local evidence summary before marking `headless-demo/` superseded.

## Environment

Important variables:

- `GRASP_RAT_BROWSERLESS_DATA_DIR`
- `GRASP_RAT_BROWSERLESS_LOG_DIR`
- `GRASP_RAT_BROWSERLESS_STATUS_HOST`
- `GRASP_RAT_BROWSERLESS_STATUS_PORT`
- `GRASP_RAT_BROWSERLESS_WEB_TOKEN`
- `GRASP_RAT_BROWSERLESS_READ_ONLY`
- `GRASP_RAT_BROWSERLESS_CONTROL_MODE`
- `GRASP_RAT_BROWSERLESS_CANARY_PROFILE`
- `GRASP_RAT_BROWSERLESS_DRY_RUN`
- `GRASP_RAT_BROWSERLESS_READONLY_PROBE_MS`
- `GRASP_RAT_BROWSERLESS_FRAME_GAP_ALERT_MS`
- `GRASP_RAT_BROWSERLESS_DECISION_INTERVAL_MS`
- `GRASP_RAT_BROWSERLESS_STALE_SELF_MS`
- `GRASP_RAT_BROWSERLESS_NO_SELF_GRACE_MS`
- `GRASP_RAT_BROWSERLESS_STAMINA_EXHAUSTED_BELOW_MS`
- `GRASP_RAT_BROWSERLESS_MOVEMENT_COMMAND_INTERVAL_MS`
- `GRASP_RAT_BROWSERLESS_MOVEMENT_TARGET_DEAD_ZONE_CM`
- `GRASP_RAT_BROWSERLESS_MOVEMENT_SETTLEMENT_FRAMES`
- `GRASP_RAT_BROWSERLESS_COMBAT_ENABLED`
- `GRASP_RAT_BROWSERLESS_COMBAT_SHOOT_MIN_INTERVAL_MS`
- `GRASP_RAT_BROWSERLESS_USER_ID`
- `GRASP_RAT_BROWSERLESS_SESSION_TOKEN`
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_X`
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y`
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP`

Full default values are listed in `docs/agent/config-defaults.md`.
