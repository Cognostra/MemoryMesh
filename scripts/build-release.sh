#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
mkdir -p "$DIST_DIR"

TARGET="${1:-local}"
BUILD_TARGET=""
OUTFILE=""

case "$TARGET" in
  local)
    echo "[build-release] building local binary"
    OUTFILE="$DIST_DIR/memorymesh"
    ;;
  linux-x64)
    echo "[build-release] building linux-x64 binary"
    BUILD_TARGET="bun-linux-x64-modern"
    OUTFILE="$DIST_DIR/memorymesh-linux-x64"
    ;;
  linux-arm64)
    echo "[build-release] building linux-arm64 binary"
    BUILD_TARGET="bun-linux-arm64"
    OUTFILE="$DIST_DIR/memorymesh-linux-arm64"
    ;;
  darwin-x64)
    echo "[build-release] building darwin-x64 binary"
    BUILD_TARGET="bun-darwin-x64"
    OUTFILE="$DIST_DIR/memorymesh-darwin-x64"
    ;;
  darwin-arm64)
    echo "[build-release] building darwin-arm64 binary"
    BUILD_TARGET="bun-darwin-arm64"
    OUTFILE="$DIST_DIR/memorymesh-darwin-arm64"
    ;;
  *)
    echo "Unknown target: $TARGET" >&2
    exit 1
    ;;
esac

if [[ -n "$BUILD_TARGET" ]]; then
  bun build "$ROOT_DIR/src/cli.ts" \
    --compile \
    --target="$BUILD_TARGET" \
    --outfile "$OUTFILE"
else
  bun build "$ROOT_DIR/src/cli.ts" \
    --compile \
    --outfile "$OUTFILE"
fi

echo "[build-release] writing checksum"
bun run "$ROOT_DIR/scripts/write-checksum.ts" "$OUTFILE"
