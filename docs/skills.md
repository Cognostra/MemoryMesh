# Public Skills

MemoryMesh exposes a curated public Agent Skills package in:

`skills/memorymesh-repo-memory/`

This is separate from MemoryMesh's internal reviewed skill-pack feature.

## What the Public Skill Does

The public skill teaches an agent how to:
- detect whether MemoryMesh is available
- initialize MemoryMesh in the current repo
- query MemoryMesh before edits
- record fixes and decisions after work
- export MemoryMesh outputs safely with redaction

It does not:
- replace the MemoryMesh binary
- install hidden runtime components without an explicit user request
- claim support for vendor-private cloud memory systems

## Install the Public Skill

List the skills published from this repository:

```bash
npx skills add Cognostra/MemoryMesh --list
bunx skills add Cognostra/MemoryMesh --list
```

Install the curated MemoryMesh skill for a specific agent:

```bash
npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a codex -y
bunx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a codex -y

npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a claude-code -y
bunx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a claude-code -y

npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a cursor -y
bunx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a cursor -y
```

## Install the MemoryMesh Binary Separately

The public skill package is only instructions and helper resources. Install the MemoryMesh binary separately:

```bash
curl -fsSL https://raw.githubusercontent.com/Cognostra/MemoryMesh/main/scripts/install.sh | bash
```

or from a local build:

```bash
bun run build:local
bun run package:local
bash ./scripts/install.sh --from-file ./dist/memorymesh.tar.gz
```

## Repository Validation

The repository validates public skill quality with:
- `bun run skills:check`
- `bun run docs:check`
- CI and release checks
