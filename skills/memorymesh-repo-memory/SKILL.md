---
name: memorymesh-repo-memory
description: Use when an agent needs to set up or use MemoryMesh for repo-local memory, recover repo conventions or prior fixes from MemoryMesh, record decisions after work, or export shareable MemoryMesh outputs safely.
---

# MemoryMesh Repo Memory

Use this skill when a repository already uses MemoryMesh, or when the user wants to start using MemoryMesh to persist repo-local memory across coding agents.

## When to Use

- The user wants shared repo memory across Codex, Claude Code, Cursor, or other MCP-native coding agents.
- The user asks for repo conventions, prior fixes, decisions, or recent session context that may already be stored in MemoryMesh.
- The user wants to initialize MemoryMesh in the current repository.
- The user wants to record a fix, decision, or note after making a change.
- The user wants to export MemoryMesh data, profiles, or skill packs safely with redaction.
- The user wants the local MCP config snippet for MemoryMesh.

## First Checks

1. Detect whether MemoryMesh is available.
   Preferred: run [`scripts/check-memorymesh.sh`](./scripts/check-memorymesh.sh).
2. Prefer the installed `memorymesh` binary when available.
3. Fall back to `./bin/memorymesh` when working inside the MemoryMesh repository itself.
4. If MemoryMesh is not installed, do not improvise hidden setup. Show the explicit install paths from [install reference](./references/install.md).

## Core Workflow

1. If MemoryMesh is available but the repo is not initialized, run `memorymesh init` or `./bin/memorymesh init`.
2. Before editing, query MemoryMesh for repo conventions, prior fixes, or recent decisions.
3. After a meaningful fix or decision, record it with `memorymesh note`.
4. When the user needs agent integration, print the MCP snippet with `memorymesh mcp-config`.
5. When the user needs to share outputs outside the repo or team boundary, prefer `--redact` or `--redact=strict`.

Use [commands reference](./references/commands.md) for exact command syntax.
Use [workflows reference](./references/workflows.md) for example sequences.

## Safety Rules

- Treat MemoryMesh data as local project context unless the user explicitly asks to export it.
- Prefer redacted exports for anything leaving the machine or trusted team boundary.
- Do not claim vendor-private cloud memories are synchronized by MemoryMesh.
- Do not invent MemoryMesh commands. Use only commands documented in this repository.
- Do not say the public skill replaces the MemoryMesh binary. The skill teaches agents how to use MemoryMesh; it does not install hidden runtime components on its own.
