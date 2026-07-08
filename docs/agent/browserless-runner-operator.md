# Browserless Runner Operator Notes

This document tracks the production browserless runner surface. `headless-demo/` is superseded for production operation and remains only a protocol probe; the production entrypoint is `scripts/browserless-runner.js`.

## Current Scope

- The runner currently supports dry-run mode, a live read-only canary, supervised movement-only mode, supervised non-combat profit mode, explicit profit-live mode for coins/AFK targets, combat dry-run mode, and explicit guarded combat live mode.
- Live read-only canary sends no movement or shoot commands. It runs pre-login snapshot safety, joins direct WS, collects frame health, and calls verified `leave`.
- Movement-only mode sends velocity commands only toward snapshot coin fallback targets, never sends shoot commands, and remains supervised-validation-only.
- Non-combat profit mode prefers realtime/native coin drops when present, uses snapshot coins only as guarded fallback, and keeps combat targets diagnostic-only.
- Profit-live mode extends profit behavior to visible AFK targets while blocking AFK profit when an Active-player threat is visible; Active-player combat still requires combat-live.
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

The installed env example defaults to dry-run read-only mode. This proves the service/deployment surface but does not connect to live WS, does not write `decisions.jsonl`, and does not satisfy canary acceptance. Before live canaries, keep a long `GRASP_RAT_BROWSERLESS_WEB_TOKEN`, set `GRASP_RAT_BROWSERLESS_DRY_RUN=false`, and set the intended `GRASP_RAT_BROWSERLESS_CANARY_PROFILE`. Session and login-point data should normally come from `/var/lib/grasp-rat-browserless/state.json`, either imported from an already authorized demo state or created through the status auth API.

For staged rollout, prefer `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` or `--canary-profile` over editing mode-specific command lines. Profiles map to existing modes:

- `read-only` -> `controlMode=read-only`
- `movement-only` -> `controlMode=movement-only`
- `profit` -> `controlMode=non-combat-profit`
- `combat-dry-run` -> `controlMode=combat-dry-run`
- `combat-live` -> `controlMode=combat-live`

The `combat-live` profile does not enable live shooting by itself; `GRASP_RAT_BROWSERLESS_COMBAT_ENABLED=true` or `--combat-enabled` is still required.
`profit-live` is an explicit control mode, not the `profit` canary profile, so existing non-combat profit acceptance audits keep their no-shoot contract.

If both `GRASP_RAT_BROWSERLESS_CANARY_PROFILE` and `GRASP_RAT_BROWSERLESS_CONTROL_MODE` are present, they must describe the same staged mode. The deployment audit rejects mismatches such as `CANARY_PROFILE=profit` with `CONTROL_MODE=combat-live`; prefer changing only the profile during VPS rollout.

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
cd ~/grasp-rat-bot
git pull --ff-only origin main
node scripts/browserless-deployment-audit.js --help | grep -- '--env-mode'
sudo node scripts/browserless-deployment-audit.js --env-mode live --fail-on-incomplete
```

`--env-mode live` expects `GRASP_RAT_BROWSERLESS_DRY_RUN=false`, a valid canary/control mode, matching profile/control values when both are present, and reusable session/login-point evidence from either env variables or the persisted state file. Prefer state-backed evidence so tokens and coordinates do not need to be copied into `/etc/grasp-rat/browserless-runner.env`. The aggregate acceptance report uses deployment env mode `any` by default so it can run after the service has legitimately moved through live staged profiles.
Live env audit validates the presence and shape of session evidence, not whether the token is still accepted by WS join. `/snapshot` may return public data for empty or wrong tokens; a direct WS open with the real user id/token is the effective session-validity check.

If the audit prints `unknown argument: --env-mode`, the VPS checkout is older than the live-readiness audit support. Pull `origin/main` with `git pull --ff-only origin main` and rerun the help check before restarting the service. Do not restart into a live canary after a failed live env audit.

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

The canary requires a reusable session and a known login point. The runner loads both from persisted state when env/CLI values are blank, and the login point is verified again through direct `/snapshot` before the formal runner joins WS.
While the canary is connected, the dry-run decision adapter evaluates current state and writes throttled `decisions.jsonl` entries. It does not send movement or shoot commands.

For service-based validation, first populate `/var/lib/grasp-rat-browserless/state.json`. If the VPS already has an authorized demo state, import it:

```bash
sudo node scripts/browserless-import-state.js \
  --from /home/ubuntu/grasp-rat-bot/headless-demo/data/state.json \
  --to /var/lib/grasp-rat-browserless/state.json \
  --source headless-demo
```

Then configure `/etc/grasp-rat/browserless-runner.env` with `GRASP_RAT_BROWSERLESS_DRY_RUN=false` and `GRASP_RAT_BROWSERLESS_CANARY_PROFILE=read-only`, audit with `sudo node scripts/browserless-deployment-audit.js --env-mode live --fail-on-incomplete`, and restart `grasp-rat-browserless-runner` only after the audit passes.

For one-off CLI validation, either provide the same values as CLI args or point `--data-dir` at a state directory that already has `state.json`:

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

For supervised validation, use 2 minutes for `--read-only-probe-ms` unless a longer diagnostic run is explicitly needed. The canary should end with verified `leave`; if leave is not confirmed, treat the run as failed and inspect `runner.jsonl`. Inspect `decisions.jsonl` to confirm combat candidates use realtime authority and snapshot coins appear only as fallback profit candidates. If no login point is present in state, a read-only bootstrap run may learn one from realtime self, but canary acceptance still requires the subsequent formal snapshot-safety run; `browserless-canary-audit` rejects bootstrap-only final events.

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
  --read-only-probe-ms 120000
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
  --read-only-probe-ms 120000
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
  --read-only-probe-ms 120000
```

Review `combat.jsonl` and `decisions.jsonl` before enabling any guarded live combat work. Expected evidence: at least one scoped combat target has `authority: "realtime"`, snapshot-only targets never appear as combat targets, aim summaries include `exact` or `linear-intercept`, shooting rows say `dryRunOnly: true` and `commandSuppressed: true`, and there are no velocity or shoot commands.

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
  --read-only-probe-ms 120000
```

Run only under direct supervision. Expected evidence: at least one `combat.jsonl` target entry uses realtime authority, `runner.jsonl` action rows show combat movement and shoot command pacing, status action state shows `shootSentCount` and the latest `shoot_ok` acknowledgement when the server accepts a shot, and the run ends with verified `leave`. Any missing leave confirmation is a failed validation.

## Status API

- `GET /` serves the built-in browserless runner panel.
- `GET /api/health` returns a simple local health response.
- `GET /api/status` returns redacted status and requires the configured web token.
- `POST /api/auth-url` requests a LinuxDO authorize URL and stores its presence in state.
- `POST /api/callback` accepts JSON with `callbackUrl` or `input`, submits the game callback/compatible login payload, and stores the returned user id and session token in state without returning the token.
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

`state.json` may contain the manually authorized session token. Public status redacts secrets and reports only token presence. The runner will use `state.session.userId`, `state.session.sessionToken`, and `state.loginPointSafety.point` when env/CLI values are blank.

Import an already authorized legacy demo state into the production state file:

```bash
sudo node scripts/browserless-import-state.js \
  --from /home/ubuntu/grasp-rat-bot/headless-demo/data/state.json \
  --to /var/lib/grasp-rat-browserless/state.json \
  --source headless-demo
```

The import output reports token presence only; it does not print the session token.

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

Use `--profile movement-only`, `--profile profit`, `--profile combat-dry-run`, or `--profile combat-live` for later stages. For the forced `/api/stop` validation, add `--require-stop`; that mode accepts an explicit-stop safety exit only when verified `leave` evidence is present. Current canary logs carry a `runId`, and the audit uses that to correlate runner, decision, combat, action, and exit evidence; older logs fall back to the selected final event's `startedAt`/`completedAt` window. Read-only and combat-dry-run audits fail if scoped movement-command logs are present; movement-only, profit, and combat-live audits require scoped movement-command evidence in addition to positive velocity counters. Combat dry-run/live audits require at least one scoped realtime combat target entry. No-shoot profiles also fail when scoped action logs show shoot-command evidence, and combat-live requires `lastShootAck` when either final counters or scoped action logs prove a shot was sent. Use `sudo` for production logs under `/var/log/grasp-rat-browserless`.

After all staged canaries and the deployment audit have run, generate the aggregate cutover readiness report:

```bash
sudo node scripts/browserless-acceptance-report.js \
  --log-dir /var/log/grasp-rat-browserless \
  --day YYYY-MM-DD \
  --fail-on-incomplete
```

This report aggregates deployment, normal read-only, forced-stop, movement-only, profit, combat dry-run, and combat live audit results. Run it with `sudo` because the included deployment audit reads the protected env file. It is the final local evidence summary before marking `headless-demo/` superseded.

The human report includes each canary section's selected run id, final event, run window, and key evidence counts (`decisions`, `movement`, `shoot`, `combat`, and `explicitStop` when present). Confirm these summaries point at the intended staged runs before treating the aggregate report as cutover evidence.

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
- `GRASP_RAT_BROWSERLESS_USER_ID` (optional when state has a session)
- `GRASP_RAT_BROWSERLESS_SESSION_TOKEN` (optional when state has a session)
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_X` (optional when state has a login point)
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_Y` (optional when state has a login point)
- `GRASP_RAT_BROWSERLESS_LOGIN_POINT_HP` (optional when state has a login point)

Full default values are listed in `docs/agent/config-defaults.md`.
