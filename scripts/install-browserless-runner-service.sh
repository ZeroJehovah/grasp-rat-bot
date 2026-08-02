#!/usr/bin/env sh
set -eu

SERVICE_NAME="grasp-rat-browserless-runner"
APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
UNIT_SOURCE="${APP_DIR}/deploy/browserless-runner.service"
ENV_SOURCE="${APP_DIR}/deploy/browserless-runner.env.example"
UNIT_DEST="${UNIT_DEST:-/etc/systemd/system/${SERVICE_NAME}.service}"
ENV_DEST="${ENV_DEST:-/etc/grasp-rat/browserless-runner.env}"
DATA_DIR="/var/lib/grasp-rat-browserless"
LOG_DIR="/var/log/grasp-rat-browserless"
INSTALL_ENV=0
RUN_SYSTEMCTL=1

usage() {
  cat <<'USAGE'
Usage: scripts/install-browserless-runner-service.sh [options]

Options:
  --app-dir <dir>      Repository/app directory for WorkingDirectory.
  --unit-dest <file>   Unit destination. Default: /etc/systemd/system/grasp-rat-browserless-runner.service
  --env-dest <file>    Env destination. Default: /etc/grasp-rat/browserless-runner.env
  --install-env        Install env example if env file is missing.
  --replace-env        Replace env file from example. Use carefully.
  --no-systemctl       Copy files without daemon-reload/enable.
  -h, --help           Show this help.
USAGE
}

REPLACE_ENV=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --unit-dest)
      UNIT_DEST="$2"
      shift 2
      ;;
    --env-dest)
      ENV_DEST="$2"
      shift 2
      ;;
    --install-env)
      INSTALL_ENV=1
      shift
      ;;
    --replace-env)
      INSTALL_ENV=1
      REPLACE_ENV=1
      shift
      ;;
    --no-systemctl)
      RUN_SYSTEMCTL=0
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

if [ ! -f "$UNIT_SOURCE" ]; then
  echo "Missing unit source: $UNIT_SOURCE" >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="${SUDO-sudo}"
fi

tmp_unit="$(mktemp)"
trap 'rm -f "$tmp_unit"' EXIT
escaped_app_dir="$(printf '%s\n' "$APP_DIR" | sed 's/[\/&]/\\&/g')"
sed "s/WorkingDirectory=\\/opt\\/grasp-rat-bot/WorkingDirectory=${escaped_app_dir}/" "$UNIT_SOURCE" > "$tmp_unit"

$SUDO install -d -m 0755 "$(dirname "$UNIT_DEST")"
$SUDO install -m 0644 "$tmp_unit" "$UNIT_DEST"
$SUDO install -d -m 0750 "$DATA_DIR"
$SUDO install -d -m 0750 "$LOG_DIR"

if [ "$INSTALL_ENV" -eq 1 ]; then
  $SUDO install -d -m 0750 "$(dirname "$ENV_DEST")"
  if [ "$REPLACE_ENV" -eq 1 ] || [ ! -f "$ENV_DEST" ]; then
    $SUDO install -m 0640 "$ENV_SOURCE" "$ENV_DEST"
  else
    echo "Env file exists, not replacing: $ENV_DEST" >&2
  fi
fi

if [ "$RUN_SYSTEMCTL" -eq 1 ]; then
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "$SERVICE_NAME"
fi

cat <<EOF
Installed $SERVICE_NAME unit:
  $UNIT_DEST

Environment file:
  $ENV_DEST

Runtime directories:
  $DATA_DIR
  $LOG_DIR

Next commands:
  sudo systemctl start $SERVICE_NAME
  sudo systemctl status $SERVICE_NAME
  systemctl show $SERVICE_NAME -p Nice
  sudo journalctl -u $SERVICE_NAME -n 120 --no-pager
EOF
