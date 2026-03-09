#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

./bin/memorymesh init .
./bin/memorymesh query "What does this repo promise?"
./bin/memorymesh note "Demo note: MemoryMesh keeps cited local repo memory."
./bin/memorymesh query "What demo note was just recorded?"
