#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[release-check] bun run docs:check"
bun run docs:check

echo "[release-check] bun test"
bun test

echo "[release-check] bun run bench"
bun run bench >/tmp/memorymesh-bench.json
cat /tmp/memorymesh-bench.json

echo "[release-check] bun run proof"
bun run proof

echo "[release-check] bun run build:local"
bun run build:local

echo "[release-check] package local release"
bash ./scripts/package-release.sh dist/memorymesh >/tmp/memorymesh-package-path.txt
cat /tmp/memorymesh-package-path.txt

echo "[release-check] install local package"
INSTALL_BIN_DIR="$(mktemp -d)"
BINDIR="$INSTALL_BIN_DIR" bash ./scripts/install.sh --from-file dist/memorymesh.tar.gz
test -x "$INSTALL_BIN_DIR/memorymesh"

echo "[release-check] proof artifacts present"
test -f proof/benchmark-report.json
test -f proof/sample-retrieval.md
test -f dist/memorymesh
test -f dist/memorymesh.sha256
test -f dist/memorymesh.tar.gz
test -f dist/memorymesh.tar.gz.sha256
