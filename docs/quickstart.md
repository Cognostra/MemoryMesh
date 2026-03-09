# Quickstart

## Requirements

- Bun 1.3+
- Git available on the machine

## Install

From source in this repo:

```bash
./bin/memorymesh --help
```

From a packaged local build:

```bash
bun run build:local
bun run package:local
bash ./scripts/install.sh --from-file ./dist/memorymesh.tar.gz
```

From a published GitHub release:

```bash
curl -fsSL https://raw.githubusercontent.com/Cognostra/MemoryMesh/main/scripts/install.sh | bash
```

If you publish from a different repo slug, set `MEMORYMESH_REPO=<owner>/<repo>` before running the installer.
After install, use `memorymesh` instead of `./bin/memorymesh`.

## Initialize

```bash
./bin/memorymesh init
```

This creates `.memorymesh/`, assigns a stable `repoId`, imports supported docs and git history, and prints an MCP config snippet.

## Query

```bash
./bin/memorymesh query "What decisions already exist in this repo?"
```

## Add a Note

```bash
./bin/memorymesh note "Fixed auth timeout by increasing retry backoff."
```

## Import an Existing Session Transcript

```bash
./bin/memorymesh import transcript ./bench/fixtures/sample-session.jsonl
```

Transcript format:
- one JSON object per line
- optional `timestamp`
- optional `sessionId`
- optional `role`, `name`, `tags`
- `content` or `summary`

## Start the MCP Server

```bash
./bin/memorymesh serve
```

Then point an MCP-compatible coding client at the local command printed by `init`.

At any time, print the MCP config again with:

```bash
./bin/memorymesh mcp-config
```

To inspect current summaries directly:

```bash
./bin/memorymesh overview
./bin/memorymesh recent
./bin/memorymesh eval bench/queries-memorymesh.json .
```

## Propose and Export a Skill Pack

```bash
./bin/memorymesh skills propose "repo-review-flow"
./bin/memorymesh skills review
./bin/memorymesh skills approve <skillId>
./bin/memorymesh export skill <skillId> ./exports/repo-review-flow.skill.md
./bin/memorymesh export skill <skillId> ./exports/repo-review-flow.shareable.skill.md --redact
```

## Export a File-Based Client Profile

```bash
./bin/memorymesh export profile claude ./profiles/claude
./bin/memorymesh export profile codex ./profiles/codex
./bin/memorymesh export profile cursor ./profiles/cursor
./bin/memorymesh export profile claude ./profiles/claude-shareable --redact
```

Redaction presets:
- `--redact` = `safe`
- `--redact=safe` = scrub obvious emails, credential-style assignments, known token formats, and repo-root paths
- `--redact=strict` = `safe` plus broader long-token scrubbing for safer sharing
