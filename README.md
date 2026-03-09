# MemoryMesh

Give Claude Code, Codex, and Cursor-style workflows shared repo memory, fully local.

MemoryMesh is a repo-local memory backend for MCP-native coding agents. It bootstraps the instructions and history already in your repository, stores cited local memory in `.memorymesh/`, and serves the same context back to multiple coding agents through one local MCP server.

Demo target:
- Initialize in an existing repo
- Ask one client for repo conventions
- Switch clients
- Get materially the same cited answer
- Record a fix and retrieve it later

## Quickstart

```bash
./bin/memorymesh init
./bin/memorymesh query "What are this repo's conventions?"
./bin/memorymesh mcp-config
./bin/memorymesh serve
./bin/memorymesh eval bench/queries-memorymesh.json .
```

Works without local models. If you later add local summarization or embedding models, MemoryMesh can improve episode quality and hybrid reranking, but the baseline product does not depend on them.

## Install

From a published release:

```bash
curl -fsSL https://raw.githubusercontent.com/Cognostra/MemoryMesh/main/scripts/install.sh | bash
```

From a local packaged build:

```bash
bun run build:local
bun run package:local
bash ./scripts/install.sh --from-file ./dist/memorymesh.tar.gz
```

The installer verifies SHA-256 checksums before copying `memorymesh` into `~/.local/bin` by default.
If you installed from a release, replace `./bin/memorymesh` in the examples below with `memorymesh`.

## Public Agent Skill

MemoryMesh also ships a curated public skill package for the Skills CLI. This skill teaches agents how to use MemoryMesh inside a repository; it does not replace the MemoryMesh binary.

```bash
npx skills add Cognostra/MemoryMesh --list
npx skills add Cognostra/MemoryMesh --skill memorymesh-repo-memory -a codex -y
```

See [Public Skills](./docs/skills.md) for install variants and the distinction between the public skill package and MemoryMesh's internal reviewed skill packs.

You can also seed MemoryMesh from an existing session transcript:

```bash
./bin/memorymesh import transcript ./bench/fixtures/sample-session.jsonl
```

## Example Output

```text
Answer:
This repo prefers Bun + TypeScript, local-first storage, and cited retrieval. The highest-priority
instruction files are AGENTS.md, CLAUDE.md, and repo docs.

Citations:
- AGENTS.md
- CLAUDE.md
- docs/architecture.md
- git: a1b2c3d Initial memory bootstrap
```

## Why This Exists

Coding agents repeatedly lose project context across:
- repo docs
- `AGENTS.md`
- `CLAUDE.md`
- Cursor rules
- git history
- prior sessions and fixes

MemoryMesh turns those sources into local, cited memory that can move with your repo and be reused across MCP-native coding agents.

## Core Features

- Repo bootstrap from docs, instruction files, and git history
- Local SQLite event log plus episode projections
- Lexical retrieval with citations
- Optional manual note capture for decisions and fixes
- MCP stdio server with search, note, refresh, and skill proposal
- Raw MCP tool/resource interaction capture for MemoryMesh-managed sessions
- Session-aware aggregation of MCP result events into recent memory episodes
- Export/import bundles
- Reviewed skill draft storage and Markdown skill-pack export
- File-based profile export for Claude/Codex/Cursor-style surfaces
- Optional safe/strict redaction for export bundles and generated profiles
- Health and integrity checks

## Comparison

| Product | Primary focus | Local-first | Cited repo retrieval | Portable bundle export | Vendor-private memory sync |
| --- | --- | --- | --- | --- | --- |
| MemoryMesh | Shared repo memory for MCP-native coding agents | Yes | Yes | Yes | No |
| mem0 | General agent memory platform | Mixed | Varies by integration | Varies | Not the focus |
| Graphiti | Real-time knowledge graph memory | Mixed | Not repo-first | Not the focus | Not the focus |
| Supermemory | Hosted memory/search workflows | Mixed | Not repo-first | Varies | Not the focus |

## Architecture

```text
repo files + git + notes
          |
          v
  append-only events (SQLite)
          |
          v
   heuristic episodes + overview
          |
          v
 lexical search + citations
          |
          v
      MCP server / CLI
```

MemoryMesh intentionally avoids graph infrastructure and multi-store write coordination in v1.

Release artifacts are generated with adjacent SHA-256 checksum files so install instructions can stay copy-paste simple without asking users to trust opaque binaries.

## Benchmarks

Benchmark assets live in [`bench/`](./bench/README.md). The repo includes:
- a benchmark harness
- retrieval fixtures
- recovery checks
- token reduction reporting
- example proof artifacts in [`proof/`](./proof/benchmark-report.json)

Run a reusable local eval:

```bash
./bin/memorymesh eval bench/queries-memorymesh.json .
```

No public performance or compression claim should appear without a reproducible script in `bench/`.

## Export Safety

Use redacted exports when you need to share MemoryMesh output outside the repo:

```bash
./bin/memorymesh export ./exports/shareable --redact
./bin/memorymesh export profile claude ./profiles/claude --redact=strict
./bin/memorymesh export skill <skillId> ./exports/review.skill.md --redact
```

`safe` redaction removes obvious emails, credential-style assignments, known API token shapes, and repo-root paths. `strict` adds broader long-token scrubbing.

## Supported Surfaces

- Generic MCP clients via stdio
- Repo docs and instruction files
- Local git history
- File-based import/export for Claude Code, Codex, and Cursor-adjacent setups

Not supported in v1:
- GitHub-hosted Copilot Memory sync
- vendor-private hosted memories
- universal bidirectional IDE sync

## Docs

- [Quickstart](./docs/quickstart.md)
- [Install](./docs/install.md)
- [Public Skills](./docs/skills.md)
- [Demo](./docs/demo.md)
- [Benchmarks](./docs/benchmarks.md)
- [Integrations](./docs/integrations.md)
- [Skill Packs](./docs/skill-packs.md)
- [Architecture](./docs/architecture.md)

## Proof Artifacts

- [Sample benchmark report](./proof/benchmark-report.json)
- [Sample retrieval transcript](./proof/sample-retrieval.md)
- [Demo helper script](./scripts/demo.sh)

Regenerate proof artifacts:

```bash
bun run proof
```

## Roadmap

- Phase 1: durable local storage, bootstrap importers, lexical search, MCP server
- Phase 2: heuristic episodes, optional local-model quality improvements, hybrid reranking
- Phase 3: reviewed skill packs, portable export/import, profile exports for file-based client surfaces

## Contributing

The repo is structured so the first useful contribution is obvious:
- run `bun test`
- run `bun run bench`
- look for `good first issue` and `help wanted` labels once the project is published

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the expected workflow and scope guardrails.
