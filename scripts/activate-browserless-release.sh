#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-/home/ubuntu/.local/node/node-v22.23.2-linux-arm64/bin/node}"
APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VERIFY_SCRIPT="$APP_DIR/scripts/verify-browserless-release.js"
RELEASE_ROOT="${GRASP_RAT_BROWSERLESS_RELEASE_ROOT:-/opt/grasp-rat-browserless}"
RELEASE_ID=""
ROLLBACK=0

usage() {
  cat <<'USAGE'
Usage: scripts/activate-browserless-release.sh [--release-id <id> | --rollback] [options]

Options:
  --release-id <id>     Activate an installed immutable release.
  --rollback            Swap current back to the installed previous release.
  --release-root <dir>  Immutable release root. Default: /opt/grasp-rat-browserless.
  -h, --help            Show this help.

Activation changes symlinks only; it does not restart the service. A normal
activation records the old current target as previous. Rollback swaps the two.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release-id)
      RELEASE_ID="$2"
      shift 2
      ;;
    --rollback)
      ROLLBACK=1
      shift
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

if [ "$ROLLBACK" -eq 1 ] && [ -n "$RELEASE_ID" ]; then
  echo "Use either --release-id or --rollback, not both" >&2
  exit 2
fi
if [ "$ROLLBACK" -eq 0 ] && [ -z "$RELEASE_ID" ]; then
  echo "--release-id or --rollback is required" >&2
  exit 2
fi

RELEASE_ROOT="${RELEASE_ROOT%/}"
if [ -z "$RELEASE_ROOT" ] || [ "$RELEASE_ROOT" = "/" ]; then
  echo "Unsafe release root: $RELEASE_ROOT" >&2
  exit 1
fi
RELEASES_DIR="$RELEASE_ROOT/releases"
CURRENT_LINK="$RELEASE_ROOT/current"
PREVIOUS_LINK="$RELEASE_ROOT/previous"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=()
else
  SUDO=(sudo -n)
fi

release_id_from_link() {
  local link="$1"
  local resolved=""
  if [ ! -L "$link" ]; then
    return 1
  fi
  resolved="$(readlink -f -- "$link")"
  case "$resolved" in
    "$RELEASES_DIR"/*) ;;
    *) return 1 ;;
  esac
  local id="${resolved##*/}"
  if ! [[ "$id" =~ ^[0-9a-f]{12}-[0-9a-f]{12}$ ]]; then
    return 1
  fi
  printf '%s\n' "$id"
}

verify_installed() {
  local id="$1"
  if ! [[ "$id" =~ ^[0-9a-f]{12}-[0-9a-f]{12}$ ]]; then
    echo "Invalid release ID: $id" >&2
    exit 1
  fi
  "${SUDO[@]}" "$NODE_BIN" "$VERIFY_SCRIPT" "$RELEASES_DIR/$id" \
    --require-read-only \
    --require-root-owned \
    --require-directory-id \
    --require-runtime-compatible >/dev/null
}

atomic_link() {
  local name="$1"
  local id="$2"
  local link="$RELEASE_ROOT/$name"
  local temporary="$RELEASE_ROOT/.$name-$id-$$"
  if [ -e "$temporary" ] || [ -L "$temporary" ]; then
    echo "Temporary activation link already exists: $temporary" >&2
    return 1
  fi
  "${SUDO[@]}" ln -s "releases/$id" "$temporary" || return 1
  if ! "${SUDO[@]}" mv -Tf -- "$temporary" "$link"; then
    "${SUDO[@]}" rm -f -- "$temporary"
    return 1
  fi
}

CURRENT_ID="$(release_id_from_link "$CURRENT_LINK" || true)"
PREVIOUS_ID="$(release_id_from_link "$PREVIOUS_LINK" || true)"
for name in current previous; do
  if [ -e "$RELEASE_ROOT/$name" ] || [ -L "$RELEASE_ROOT/$name" ]; then
    if ! release_id_from_link "$RELEASE_ROOT/$name" >/dev/null; then
      echo "Invalid existing release pointer: $name" >&2
      exit 1
    fi
  fi
done

POINTER_UPDATE_STARTED=0
restore_pointers_on_error() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$POINTER_UPDATE_STARTED" -eq 1 ]; then
    echo "Activation failed; restoring original release pointers" >&2
    if [ -n "$CURRENT_ID" ]; then
      atomic_link current "$CURRENT_ID" || echo "Could not restore current" >&2
    else
      "${SUDO[@]}" rm -f -- "$CURRENT_LINK"
    fi
    if [ -n "$PREVIOUS_ID" ]; then
      atomic_link previous "$PREVIOUS_ID" || echo "Could not restore previous" >&2
    else
      "${SUDO[@]}" rm -f -- "$PREVIOUS_LINK"
    fi
  fi
  exit "$status"
}
trap restore_pointers_on_error EXIT

if [ "$ROLLBACK" -eq 1 ]; then
  if [ -z "$CURRENT_ID" ] || [ -z "$PREVIOUS_ID" ]; then
    echo "Rollback requires valid current and previous release links" >&2
    exit 1
  fi
  if [ "$CURRENT_ID" = "$PREVIOUS_ID" ]; then
    echo "Rollback target is the same as current: $CURRENT_ID" >&2
    exit 1
  fi
  verify_installed "$CURRENT_ID"
  verify_installed "$PREVIOUS_ID"
  POINTER_UPDATE_STARTED=1
  atomic_link current "$PREVIOUS_ID"
  if ! atomic_link previous "$CURRENT_ID"; then
    echo "Rollback could not update previous; restoring current=$CURRENT_ID" >&2
    atomic_link current "$CURRENT_ID" || true
    exit 1
  fi
  ACTION=rollback
  NEW_CURRENT="$PREVIOUS_ID"
  NEW_PREVIOUS="$CURRENT_ID"
else
  verify_installed "$RELEASE_ID"
  if [ "$CURRENT_ID" = "$RELEASE_ID" ]; then
    printf '{"ok":true,"action":"unchanged","currentReleaseId":"%s","previousReleaseId":"%s"}\n' "$CURRENT_ID" "$PREVIOUS_ID"
    exit 0
  fi
  if [ -n "$CURRENT_ID" ]; then
    verify_installed "$CURRENT_ID"
    POINTER_UPDATE_STARTED=1
    atomic_link previous "$CURRENT_ID"
    NEW_PREVIOUS="$CURRENT_ID"
  else
    NEW_PREVIOUS="$PREVIOUS_ID"
  fi
  POINTER_UPDATE_STARTED=1
  atomic_link current "$RELEASE_ID"
  ACTION=activate
  NEW_CURRENT="$RELEASE_ID"
fi

verify_installed "$NEW_CURRENT"
if [ -n "$NEW_PREVIOUS" ]; then
  verify_installed "$NEW_PREVIOUS"
fi
printf '{"ok":true,"action":"%s","currentReleaseId":"%s","previousReleaseId":"%s"}\n' "$ACTION" "$NEW_CURRENT" "$NEW_PREVIOUS"
