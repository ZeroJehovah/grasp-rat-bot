#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export GRASP_RAT_DEMO_HOST="${GRASP_RAT_DEMO_HOST:-127.0.0.1}"
export GRASP_RAT_DEMO_PORT="${GRASP_RAT_DEMO_PORT:-18766}"
export GRASP_RAT_DEMO_WEB_TOKEN="${GRASP_RAT_DEMO_WEB_TOKEN:-}"

if [ ! -f "$ROOT_DIR/node_modules/ws/package.json" ]; then
  echo "[headless-demo] installing production npm dependencies..."
  npm install --omit=dev
fi

echo "[headless-demo] listening on ${GRASP_RAT_DEMO_HOST}:${GRASP_RAT_DEMO_PORT}"
echo "[headless-demo] open the configured address and supply your token if enabled"

exec node headless-demo/server.js
