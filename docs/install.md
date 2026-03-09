# Install

## Release Install

```bash
curl -fsSL https://raw.githubusercontent.com/Cognostra/MemoryMesh/main/scripts/install.sh | bash
```

Defaults:
- installs to `~/.local/bin`
- downloads the latest GitHub release
- verifies the `.sha256` asset before install

Optional overrides:
- `MEMORYMESH_REPO=<owner>/<repo>`
- `MEMORYMESH_VERSION=v0.1.0`
- `BINDIR=/custom/bin`
- `INSTALL_NAME=memorymesh`

Example:

```bash
curl -fsSL https://raw.githubusercontent.com/Cognostra/MemoryMesh/main/scripts/install.sh -o /tmp/install-memorymesh.sh
MEMORYMESH_REPO=Cognostra/MemoryMesh MEMORYMESH_VERSION=v0.1.0 bash /tmp/install-memorymesh.sh
```

## Local Package Install

```bash
bun run build:local
bun run package:local
bash ./scripts/install.sh --from-file ./dist/memorymesh.tar.gz
```

This is the easiest way to test the exact release-install flow before publishing.

After install, use `memorymesh` instead of `./bin/memorymesh`.
