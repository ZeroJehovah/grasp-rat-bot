#!/usr/bin/env bash
set -euo pipefail

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
  "${SUDO[@]}" node "$VERIFY_SCRIPT" "$RELEASES_DIR/$id" \
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
    exit 1
  fi
  "${SUDO[@]}" ln -s "releases/$id" "$temporary"
  "${SUDO[@]}" mv -Tf -- "$temporary" "$link"
}

CURRENT_ID="$(release_id_from_link "$CURRENT_LINK" || true)"
PREVIOUS_ID="$(release_id_from_link "$PREVIOUS_LINK" || true)"

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
    atomic_link previous "$CURRENT_ID"
    NEW_PREVIOUS="$CURRENT_ID"
  else
    NEW_PREVIOUS="$PREVIOUS_ID"
  fi
  atomic_link current "$RELEASE_ID"
  ACTION=activate
  NEW_CURRENT="$RELEASE_ID"
fi

verify_installed "$NEW_CURRENT"
if [ -n "$NEW_PREVIOUS" ]; then
  verify_installed "$NEW_PREVIOUS"
fi
printf '{"ok":true,"action":"%s","currentReleaseId":"%s","previousReleaseId":"%s"}\n' "$ACTION" "$NEW_CURRENT" "$NEW_PREVIOUS"
