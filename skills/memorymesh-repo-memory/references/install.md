# Install Reference

Use these install paths when MemoryMesh is not already available.

## Install the Public Agent Skill

List available skills in this repository:

```bash
npx skills add Cognostra/MemoryMesh --list
bunx skills add Cognostra/MemoryMesh --list
```

Install this curated skill for a specific agent:

```bash
npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a codex -y
bunx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a codex -y

npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a claude-code -y
bunx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a claude-code -y

npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a cursor -y
bunx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a cursor -y
```

This installs the skill package, not the MemoryMesh binary.

## Install the MemoryMesh Binary

Published release install:

```bash
curl -fsSL https://raw.githubusercontent.com/Cognostra/MemoryMesh/main/scripts/install.sh | bash
```

If you are already inside the MemoryMesh source repository, `./bin/memorymesh` is also a valid repo-local command surface.

After binary install, use `memorymesh` in commands instead of `./bin/memorymesh`.
