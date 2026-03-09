#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_PATH="${1:-}"

if [[ -z "$ARTIFACT_PATH" ]]; then
  echo "Usage: bash ./scripts/package-release.sh <artifact-path>" >&2
  exit 1
fi

if [[ ! -f "$ARTIFACT_PATH" ]]; then
  echo "Artifact not found: $ARTIFACT_PATH" >&2
  exit 1
fi

ARTIFACT_DIR="$(cd "$(dirname "$ARTIFACT_PATH")" && pwd)"
ARTIFACT_NAME="$(basename "$ARTIFACT_PATH")"
PACKAGE_PATH="$ARTIFACT_DIR/$ARTIFACT_NAME.tar.gz"
TEMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TEMP_DIR"
}

trap cleanup EXIT

cp "$ARTIFACT_PATH" "$TEMP_DIR/memorymesh"

tar -czf "$PACKAGE_PATH" -C "$TEMP_DIR" memorymesh
bun run "$ROOT_DIR/scripts/write-checksum.ts" "$PACKAGE_PATH" >/dev/null

echo "$PACKAGE_PATH"
