#!/usr/bin/env bash
NODE_BIN="${NODE_BIN:-/home/ubuntu/.local/node/node-v22.23.2-linux-arm64/bin/node}"
set -euo pipefail

APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VERIFY_SCRIPT="$APP_DIR/scripts/verify-browserless-release.js"
RELEASE_ROOT="${GRASP_RAT_BROWSERLESS_RELEASE_ROOT:-/opt/grasp-rat-browserless}"
RELEASE_DIR=""

usage() {
  cat <<'USAGE'
Usage: scripts/install-browserless-release.sh --release-dir <dir> [options]

Options:
  --release-dir <dir>   Built browserless release to install.
  --release-root <dir>  Immutable release root. Default: /opt/grasp-rat-browserless.
  -h, --help            Show this help.

The installed tree is root:root, contains no symlinks, and is read-only. The
script is idempotent when the exact release already exists and still verifies.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-dir)
      RELEASE_DIR="$2"
      shift 2
      ;;
    --release-root)
      RELEASE_ROOT="$2"
      shift 2
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

if [ -z "$RELEASE_DIR" ]; then
  echo "--release-dir is required" >&2
  exit 2
fi
if [ ! -f "$VERIFY_SCRIPT" ]; then
  echo "Release verifier is missing: $VERIFY_SCRIPT" >&2
  exit 1
fi

RELEASE_DIR="$(readlink -f -- "$RELEASE_DIR")"
RELEASE_ROOT="${RELEASE_ROOT%/}"
if [ ! -d "$RELEASE_DIR" ]; then
  echo "Release directory is missing: $RELEASE_DIR" >&2
  exit 1
fi
if [ -z "$RELEASE_ROOT" ] || [ "$RELEASE_ROOT" = "/" ]; then
  echo "Unsafe release root: $RELEASE_ROOT" >&2
  exit 1
fi

"$NODE_BIN" "$VERIFY_SCRIPT" "$RELEASE_DIR" --require-read-only --require-runtime-compatible >/dev/null
RELEASE_ID="$(node -e 'const fs=require("fs"); const path=require("path"); const root=process.argv[1]; process.stdout.write(JSON.parse(fs.readFileSync(path.join(root,"release-manifest.json"),"utf8")).releaseId || "");' "$RELEASE_DIR")"
if ! [[ "$RELEASE_ID" =~ ^[0-9a-f]{12}-[0-9a-f]{12}$ ]]; then
  echo "Invalid release ID: $RELEASE_ID" >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=()
else
  SUDO=(sudo -n)
fi

RELEASES_DIR="$RELEASE_ROOT/releases"
TARGET="$RELEASES_DIR/$RELEASE_ID"
STAGING="$RELEASES_DIR/.install-$RELEASE_ID-$$"
if [ "$TARGET" = "$RELEASE_ROOT" ] || [ "$STAGING" = "$RELEASE_ROOT" ]; then
  echo "Unsafe release target" >&2
  exit 1
fi

cleanup() {
  if [ -e "$STAGING" ] || [ -L "$STAGING" ]; then
    "${SUDO[@]}" find "$STAGING" -type d -exec chmod u+w {} +
    "${SUDO[@]}" find "$STAGING" -depth -mindepth 1 -delete
    "${SUDO[@]}" rmdir -- "$STAGING"
  fi
}
trap cleanup EXIT

"${SUDO[@]}" install -d -o root -g root -m 0555 "$RELEASE_ROOT" "$RELEASES_DIR"
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  "${SUDO[@]}" "$NODE_BIN" "$VERIFY_SCRIPT" "$TARGET" \
    --require-read-only \
    --require-root-owned \
    --require-directory-id \
    --require-runtime-compatible >/dev/null
  printf '{"ok":true,"installed":false,"alreadyPresent":true,"releaseId":"%s","releaseDir":"%s"}\n' "$RELEASE_ID" "$TARGET"
  exit 0
fi

"${SUDO[@]}" mkdir -- "$STAGING"
"${SUDO[@]}" cp -a -- "$RELEASE_DIR/." "$STAGING/"
"${SUDO[@]}" chown -R root:root "$STAGING"
"${SUDO[@]}" find "$STAGING" -type d -exec chmod 0555 {} +
"${SUDO[@]}" find "$STAGING" -type f -exec chmod 0444 {} +
"${SUDO[@]}" chmod 0555 \
  "$STAGING/browserless-runner.cjs" \
  "$STAGING/benchmark-browserless-hot-path.cjs" \
  "$STAGING/verify-release.cjs"
"${SUDO[@]}" find "$STAGING" -type f -name '*.node' -exec chmod 0555 {} +
"${SUDO[@]}" "$NODE_BIN" "$VERIFY_SCRIPT" "$STAGING" \
  --require-read-only \
  --require-root-owned \
  --require-runtime-compatible >/dev/null
"${SUDO[@]}" mv -- "$STAGING" "$TARGET"
"${SUDO[@]}" "$NODE_BIN" "$VERIFY_SCRIPT" "$TARGET" \
  --require-read-only \
  --require-root-owned \
  --require-directory-id \
  --require-runtime-compatible >/dev/null

trap - EXIT
printf '{"ok":true,"installed":true,"alreadyPresent":false,"releaseId":"%s","releaseDir":"%s"}\n' "$RELEASE_ID" "$TARGET"
