#!/usr/bin/env bash
set -euo pipefail

memorymesh_cmd=""

if command -v memorymesh >/dev/null 2>&1; then
  memorymesh_cmd="memorymesh"
elif [[ -x "./bin/memorymesh" ]]; then
  memorymesh_cmd="./bin/memorymesh"
fi

if [[ -z "$memorymesh_cmd" ]]; then
  echo "available=false"
  echo "initialized=false"
  echo "command="
  echo "detail=memorymesh-not-found"
  exit 1
fi

initialized="false"
if [[ -f ".memorymesh/repo.json" ]]; then
  initialized="true"
fi

if "$memorymesh_cmd" --help >/dev/null 2>&1; then
  help_status="ok"
else
  help_status="failed"
fi

echo "available=true"
echo "initialized=$initialized"
echo "command=$memorymesh_cmd"
echo "detail=$help_status"
