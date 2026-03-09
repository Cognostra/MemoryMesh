#!/usr/bin/env bash
set -euo pipefail

MEMORYMESH_REPO="${MEMORYMESH_REPO:-gevorian/MemoryMesh}"
BINDIR="${BINDIR:-$HOME/.local/bin}"
INSTALL_NAME="${INSTALL_NAME:-memorymesh}"
VERSION="${MEMORYMESH_VERSION:-latest}"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/install.sh
  bash ./scripts/install.sh --version v0.1.0
  bash ./scripts/install.sh --from-file ./dist/memorymesh-linux-x64.tar.gz

Environment overrides:
  MEMORYMESH_REPO     GitHub repo slug to download from
  MEMORYMESH_VERSION  Release tag or "latest"
  BINDIR              Install directory (default: ~/.local/bin)
  INSTALL_NAME        Installed binary name (default: memorymesh)
EOF
}

detect_os() {
  local kernel
  kernel="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$kernel" in
    linux*) echo "linux" ;;
    darwin*) echo "darwin" ;;
    *)
      echo "Unsupported OS: $kernel" >&2
      exit 1
      ;;
  esac
}

detect_arch() {
  local machine
  machine="$(uname -m)"
  case "$machine" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $machine" >&2
      exit 1
      ;;
  esac
}

download_file() {
  local url="$1"
  local output_path="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output_path"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output_path" "$url"
    return
  fi

  echo "Need curl or wget to download release assets." >&2
  exit 1
}

verify_checksum() {
  local checksum_path="$1"
  local target_path="$2"
  local expected actual

  if command -v sha256sum >/dev/null 2>&1; then
    expected="$(awk '{print $1}' "$checksum_path")"
    actual="$(sha256sum "$target_path" | awk '{print $1}')"
    if [[ "$expected" != "$actual" ]]; then
      echo "Checksum mismatch for $target_path" >&2
      exit 1
    fi
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    expected="$(awk '{print $1}' "$checksum_path")"
    actual="$(shasum -a 256 "$target_path" | awk '{print $1}')"
    if [[ "$expected" != "$actual" ]]; then
      echo "Checksum mismatch for $target_path" >&2
      exit 1
    fi
    return
  fi

  echo "Need sha256sum or shasum to verify release checksum." >&2
  exit 1
}

install_archive() {
  local archive_path="$1"
  local checksum_path="$2"
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap "rm -rf '$temp_dir'" EXIT

  verify_checksum "$checksum_path" "$archive_path"
  mkdir -p "$BINDIR"
  tar -xzf "$archive_path" -C "$temp_dir"
  install -m 0755 "$temp_dir/memorymesh" "$BINDIR/$INSTALL_NAME"

  echo "Installed $INSTALL_NAME to $BINDIR/$INSTALL_NAME"
  echo "Next:"
  echo "  $INSTALL_NAME init"
  echo "  $INSTALL_NAME mcp-config"
}

main() {
  local mode="download"
  local archive_path=""
  local checksum_path=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from-file)
        mode="local"
        archive_path="${2:-}"
        if [[ -z "$archive_path" ]]; then
          echo "--from-file requires a path" >&2
          exit 1
        fi
        shift 2
        ;;
      --version)
        VERSION="${2:-}"
        if [[ -z "$VERSION" ]]; then
          echo "--version requires a value" >&2
          exit 1
        fi
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  if [[ "$mode" == "local" ]]; then
    checksum_path="${archive_path}.sha256"
    install_archive "$archive_path" "$checksum_path"
    return
  fi

  local os arch asset_base base_url temp_dir
  os="$(detect_os)"
  arch="$(detect_arch)"
  asset_base="memorymesh-${os}-${arch}"
  temp_dir="$(mktemp -d)"
  trap "rm -rf '$temp_dir'" EXIT

  if [[ "$VERSION" == "latest" ]]; then
    base_url="https://github.com/$MEMORYMESH_REPO/releases/latest/download"
  else
    base_url="https://github.com/$MEMORYMESH_REPO/releases/download/$VERSION"
  fi

  archive_path="$temp_dir/$asset_base.tar.gz"
  checksum_path="$temp_dir/$asset_base.tar.gz.sha256"

  download_file "$base_url/$asset_base.tar.gz" "$archive_path"
  download_file "$base_url/$asset_base.tar.gz.sha256" "$checksum_path"
  install_archive "$archive_path" "$checksum_path"
}

main "$@"
