#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export GRASP_RAT_DEMO_HOST="${GRASP_RAT_DEMO_HOST:-0.0.0.0}"
export GRASP_RAT_DEMO_PORT="${GRASP_RAT_DEMO_PORT:-18766}"
export GRASP_RAT_DEMO_WEB_TOKEN="${GRASP_RAT_DEMO_WEB_TOKEN:-1234567890}"

if [ ! -f "$ROOT_DIR/node_modules/ws/package.json" ]; then
  echo "[headless-demo] installing production npm dependencies..."
  npm install --omit=dev
fi

echo "[headless-demo] listening on ${GRASP_RAT_DEMO_HOST}:${GRASP_RAT_DEMO_PORT}"
echo "[headless-demo] open http://<vps-ip>:${GRASP_RAT_DEMO_PORT}/?token=${GRASP_RAT_DEMO_WEB_TOKEN}"

exec node headless-demo/server.js
