#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SERVICE_NAME="grasp-rat-browserless-runner.service"
ENV_PATH="/etc/grasp-rat/browserless-runner.env"
DATA_DIR="/var/lib/grasp-rat-browserless"
LOG_DIR="/var/log/grasp-rat-browserless"
RELEASE_ROOT="${GRASP_RAT_BROWSERLESS_RELEASE_ROOT:-/opt/grasp-rat-browserless}"
REVISION="HEAD"
BUILD_ROOT=""
KEEP_BUILD=0
AUTO_ROLLBACK=1

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-browserless-release.sh [options]

Options:
  --revision <commit>       Exact pushed commit to release. Default: HEAD.
  --release-root <dir>      Immutable release root. Default: /opt/grasp-rat-browserless.
  --env <file>              Production environment file.
  --data-dir <dir>          Browserless data directory.
  --log-dir <dir>           Browserless log directory.
  --build-root <dir>        Build workspace; must not already exist.
  --keep-build              Keep the temporary build workspace after success.
  --no-auto-rollback        Do not automatically restore previous after a post-activation failure.
  -h, --help                Show this help.

The revision must equal origin/main. The script builds from git archive, verifies
and benchmarks the artifact, installs it read-only, atomically activates it,
restarts the service, and proves the running artifact revision.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --revision)
      REVISION="$2"
      shift 2
      ;;
    --release-root)
      RELEASE_ROOT="$2"
      shift 2
      ;;
    --env)
      ENV_PATH="$2"
      shift 2
      ;;
    --data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    --log-dir)
      LOG_DIR="$2"
      shift 2
      ;;
    --build-root)
      BUILD_ROOT="$2"
      shift 2
      ;;
    --keep-build)
      KEEP_BUILD=1
      shift
      ;;
    --no-auto-rollback)
      AUTO_ROLLBACK=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Deployment must run from the primary source checkout: $APP_DIR" >&2
  exit 1
fi
if [ ! -f "$ENV_PATH" ]; then
  echo "Environment file is missing: $ENV_PATH" >&2
  exit 1
fi
RELEASE_ROOT="${RELEASE_ROOT%/}"
if [ -z "$RELEASE_ROOT" ] || [ "$RELEASE_ROOT" = "/" ]; then
  echo "Unsafe release root: $RELEASE_ROOT" >&2
  exit 1
fi
if [ "$RELEASE_ROOT" != "/opt/grasp-rat-browserless" ]; then
  echo "Production service unit requires release root /opt/grasp-rat-browserless: $RELEASE_ROOT" >&2
  exit 1
fi

SOURCE_REVISION="$(git -C "$APP_DIR" rev-parse --verify "$REVISION^{commit}")"
ORIGIN_REVISION="$(git -C "$APP_DIR" rev-parse --verify origin/main^{commit})"
if [ "$SOURCE_REVISION" != "$ORIGIN_REVISION" ]; then
  echo "Refusing to deploy an unpushed or stale revision: source=$SOURCE_REVISION origin/main=$ORIGIN_REVISION" >&2
  exit 1
fi
RUNTIME_REVISION="${SOURCE_REVISION:0:12}"
RELEASE_TOOLING=(
  deploy/browserless-runner.service
  package.json
  scripts/activate-browserless-release.sh
  scripts/build-browserless-release.js
  scripts/browserless-deployment-audit.js
  scripts/deploy-browserless-release.sh
  scripts/install-browserless-release.sh
  scripts/install-browserless-runner-service.sh
  scripts/verify-browserless-release.js
  scripts/verify-browserless-runner-start.js
)
if ! git -C "$APP_DIR" diff --quiet "$SOURCE_REVISION" -- "${RELEASE_TOOLING[@]}"; then
  echo "Release tooling differs from the exact target revision; commit and push it before deployment" >&2
  git -C "$APP_DIR" diff --name-only "$SOURCE_REVISION" -- "${RELEASE_TOOLING[@]}" >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=()
else
  SUDO=(sudo -n)
fi

if [ -z "$BUILD_ROOT" ]; then
  BUILD_ROOT="$(mktemp -d /tmp/grasp-rat-browserless-release.XXXXXX)"
else
  if [ -e "$BUILD_ROOT" ] || [ -L "$BUILD_ROOT" ]; then
    echo "Build root already exists: $BUILD_ROOT" >&2
    exit 1
  fi
  mkdir -m 0755 -- "$BUILD_ROOT"
  BUILD_ROOT="$(readlink -f -- "$BUILD_ROOT")"
fi
ARTIFACT_DIR="$BUILD_ROOT/release"
mkdir -m 0755 -- "$ARTIFACT_DIR"

ACTIVATION_CHANGED=0
ROLLBACK_ATTEMPTED=0
cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$ACTIVATION_CHANGED" -eq 1 ] && [ "$AUTO_ROLLBACK" -eq 1 ] && [ "$ROLLBACK_ATTEMPTED" -eq 0 ]; then
    ROLLBACK_ATTEMPTED=1
    echo "Deployment failed after activation; attempting immutable rollback" >&2
    if "$APP_DIR/scripts/activate-browserless-release.sh" --rollback --release-root "$RELEASE_ROOT"; then
      "${SUDO[@]}" systemctl restart "$SERVICE_NAME" || true
      "${SUDO[@]}" node "$APP_DIR/scripts/browserless-deployment-audit.js" \
        --env-mode live \
        --env "$ENV_PATH" \
        --data-dir "$DATA_DIR" \
        --log-dir "$LOG_DIR" \
        --release-root "$RELEASE_ROOT" \
        --source-dir "$APP_DIR" || true
    else
      echo "Automatic rollback could not activate previous; current remains $(readlink -f "$RELEASE_ROOT/current" 2>/dev/null || true)" >&2
    fi
  fi
  if [ "$status" -eq 0 ] && [ "$KEEP_BUILD" -eq 0 ]; then
    find "$BUILD_ROOT" -type d -exec chmod u+w {} +
    find "$BUILD_ROOT" -depth -mindepth 1 -delete
    rmdir -- "$BUILD_ROOT"
  else
    echo "Build workspace retained: $BUILD_ROOT" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

node "$APP_DIR/scripts/build-browserless-release.js" \
  --repository "$APP_DIR" \
  --revision "$SOURCE_REVISION" \
  --output-dir "$ARTIFACT_DIR"
node "$APP_DIR/scripts/verify-browserless-release.js" "$ARTIFACT_DIR" \
  --require-read-only \
  --require-runtime-compatible

RELEASE_ID="$(node -e 'const fs=require("fs"); const path=require("path"); const manifest=JSON.parse(fs.readFileSync(path.join(process.argv[1],"release-manifest.json"),"utf8")); process.stdout.write(manifest.releaseId);' "$ARTIFACT_DIR")"
ARTIFACT_DIGEST="$(node -e 'const fs=require("fs"); const path=require("path"); const manifest=JSON.parse(fs.readFileSync(path.join(process.argv[1],"release-manifest.json"),"utf8")); process.stdout.write(manifest.artifactDigest);' "$ARTIFACT_DIR")"

for file in \
  browserless-runner.cjs \
  benchmark-browserless-hot-path.cjs \
  decision-worker-thread.js \
  realtime-control-worker-thread.js \
  background-io-worker.js \
  leave-supervisor-worker.js \
  remote-profit-worker-thread.js \
  web-panel.js \
  verify-release.cjs; do
  node --check "$ARTIFACT_DIR/$file"
done

node -e 'const Database=require(process.argv[1]); const db=new Database(":memory:"); db.exec("create table release_smoke(value integer); insert into release_smoke values (1)"); if (db.prepare("select value from release_smoke").get().value !== 1) process.exit(1); db.close();' \
  "$ARTIFACT_DIR/node_modules/better-sqlite3"

node "$ARTIFACT_DIR/browserless-runner.cjs" --self-test > "$BUILD_ROOT/artifact-self-test.json"
node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if (!value.ok) throw new Error("artifact self-test did not report ok=true");' "$BUILD_ROOT/artifact-self-test.json"

"${SUDO[@]}" nice -n -10 node "$ARTIFACT_DIR/benchmark-browserless-hot-path.cjs" \
  --iterations 500 \
  --warmup 100 \
  --learning-file "$DATA_DIR/combat-learning.json" \
  --state-file "$DATA_DIR/state.json" \
  --realtime-entities 128 \
  --canary-duration-ms 5000 \
  --frame-interval-ms 5 \
  --fail-on-budget | tee "$BUILD_ROOT/artifact-benchmark.log"

INSTALL_REPORT="$($APP_DIR/scripts/install-browserless-release.sh --release-dir "$ARTIFACT_DIR" --release-root "$RELEASE_ROOT")"
printf '%s\n' "$INSTALL_REPORT"
OLD_CURRENT_RELEASE="$(readlink -f "$RELEASE_ROOT/current" 2>/dev/null || true)"
ACTIVATE_REPORT="$($APP_DIR/scripts/activate-browserless-release.sh --release-id "$RELEASE_ID" --release-root "$RELEASE_ROOT")"
printf '%s\n' "$ACTIVATE_REPORT"
NEW_CURRENT_RELEASE="$(readlink -f "$RELEASE_ROOT/current")"
if [ "$NEW_CURRENT_RELEASE" != "$OLD_CURRENT_RELEASE" ]; then
  ACTIVATION_CHANGED=1
fi

UNIT_DEST="/etc/systemd/system/$SERVICE_NAME" \
ENV_DEST="$ENV_PATH" \
  "$APP_DIR/scripts/install-browserless-runner-service.sh"

PREVIOUS_START_MONOTONIC="$(systemctl show "$SERVICE_NAME" -p ExecMainStartTimestampMonotonic --value 2>/dev/null || true)"
RESTART_REQUESTED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
if "${SUDO[@]}" systemctl restart "$SERVICE_NAME"; then
  echo "systemctl restart succeeded"
else
  restart_status=$?
  echo "systemctl restart failed with status $restart_status" >&2
  systemctl status "$SERVICE_NAME" --no-pager -l || true
  "${SUDO[@]}" journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
  exit "$restart_status"
fi

EXPECTED_RELEASE_DIR="$RELEASE_ROOT/releases/$RELEASE_ID"
RESTART_READY=0
for _attempt in $(seq 1 30); do
  ACTIVE_STATE="$(systemctl show "$SERVICE_NAME" -p ActiveState --value 2>/dev/null || true)"
  SUB_STATE="$(systemctl show "$SERVICE_NAME" -p SubState --value 2>/dev/null || true)"
  RUNNER_PID="$(systemctl show "$SERVICE_NAME" -p ExecMainPID --value 2>/dev/null || true)"
  RUNNER_START_MONOTONIC="$(systemctl show "$SERVICE_NAME" -p ExecMainStartTimestampMonotonic --value 2>/dev/null || true)"
  RUNNER_CWD=""
  if [[ "$RUNNER_PID" =~ ^[1-9][0-9]*$ ]]; then
    RUNNER_CWD="$("${SUDO[@]}" readlink -f "/proc/$RUNNER_PID/cwd" 2>/dev/null || true)"
  fi
  START_IS_NEW=0
  if [[ "$RUNNER_START_MONOTONIC" =~ ^[0-9]+$ ]] \
    && { ! [[ "$PREVIOUS_START_MONOTONIC" =~ ^[0-9]+$ ]] || (( RUNNER_START_MONOTONIC > PREVIOUS_START_MONOTONIC )); }; then
    START_IS_NEW=1
  fi
  if [ "$ACTIVE_STATE" = active ] \
    && [ "$SUB_STATE" = running ] \
    && [ "$RUNNER_CWD" = "$EXPECTED_RELEASE_DIR" ] \
    && [ "$START_IS_NEW" -eq 1 ]; then
    RESTART_READY=1
    break
  fi
  sleep 1
done
if [ "$RESTART_READY" -ne 1 ]; then
  echo "Restart succeeded, but immutable runtime verification did not become ready within 30 seconds" >&2
  systemctl show "$SERVICE_NAME" -p ActiveState -p SubState -p Result -p ExecMainStartTimestamp -p ExecMainStartTimestampMonotonic -p ExecMainPID -p WorkingDirectory -p Nice -p NRestarts || true
  exit 1
fi

"${SUDO[@]}" node "$APP_DIR/scripts/browserless-deployment-audit.js" \
  --env-mode live \
  --env "$ENV_PATH" \
  --data-dir "$DATA_DIR" \
  --log-dir "$LOG_DIR" \
  --release-root "$RELEASE_ROOT" \
  --source-dir "$APP_DIR" \
  --expected-revision "$SOURCE_REVISION" \
  --fail-on-incomplete

STATUS_PORT="$(sed -n 's/^GRASP_RAT_BROWSERLESS_STATUS_PORT=//p' "$ENV_PATH" | tail -1)"
STATUS_PORT="${STATUS_PORT:-18767}"
if ! [[ "$STATUS_PORT" =~ ^[1-9][0-9]{0,4}$ ]] || [ "$STATUS_PORT" -gt 65535 ]; then
  echo "Invalid browserless status port: $STATUS_PORT" >&2
  exit 1
fi
curl -fsS "http://127.0.0.1:$STATUS_PORT/api/health" >/dev/null
"${SUDO[@]}" node "$APP_DIR/scripts/verify-browserless-runner-start.js" \
  --log-dir "$LOG_DIR" \
  --after "$RESTART_REQUESTED_AT" \
  --revision "$RUNTIME_REVISION"

CURRENT_RELEASE="$(readlink -f "$RELEASE_ROOT/current")"
PREVIOUS_RELEASE="$(readlink -f "$RELEASE_ROOT/previous" 2>/dev/null || true)"
RUNNER_PID="$(systemctl show "$SERVICE_NAME" -p ExecMainPID --value)"
RUNNER_CWD="$("${SUDO[@]}" readlink -f "/proc/$RUNNER_PID/cwd")"
systemctl show "$SERVICE_NAME" -p ActiveState -p SubState -p Result -p ExecMainStartTimestamp -p ExecMainPID -p WorkingDirectory -p Nice -p NRestarts
printf '{"ok":true,"releaseId":"%s","artifactDigest":"%s","sourceRevision":"%s","runtimeRevision":"%s","currentRelease":"%s","previousRelease":"%s","processCwd":"%s","buildRoot":"%s"}\n' \
  "$RELEASE_ID" "$ARTIFACT_DIGEST" "$SOURCE_REVISION" "$RUNTIME_REVISION" "$CURRENT_RELEASE" "$PREVIOUS_RELEASE" "$RUNNER_CWD" "$BUILD_ROOT"
