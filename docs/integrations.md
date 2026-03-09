# Integrations

## Supported Today

- Generic MCP stdio clients
- File-based repo instruction surfaces
- Local git history import
- User-supplied transcript JSONL import

## File-Based Profiles

- Claude Code: `CLAUDE.md`, `.claude/`
- Codex-style repos: `AGENTS.md`
- Cursor-style repos: `.cursor/rules/`

MemoryMesh can export generated file-based profiles for these surfaces:

```bash
./bin/memorymesh export profile claude ./profiles/claude
./bin/memorymesh export profile codex ./profiles/codex
./bin/memorymesh export profile cursor ./profiles/cursor
./bin/memorymesh export profile claude ./profiles/claude-shareable --redact
```

When exporting outside your machine or team boundary, prefer `--redact` or `--redact=strict` so generated profiles do not leak obvious emails, credential strings, or local repo-root paths.

## Explicitly Unsupported in v1

- GitHub-hosted Copilot Memory sync
- vendor-private cloud memories
- universal bidirectional sync across proprietary IDEs
