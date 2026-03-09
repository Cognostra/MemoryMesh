# Commands Reference

Use `<mm>` as:
- `memorymesh` if the binary is installed on `PATH`
- `./bin/memorymesh` when working inside the MemoryMesh repository

## Setup

```bash
<mm> init
<mm> mcp-config
<mm> serve
<mm> doctor
```

## Retrieval and Capture

```bash
<mm> query "What conventions does this repo follow?"
<mm> query "How did we fix the auth timeout bug?"
<mm> overview
<mm> recent
<mm> note "Fixed auth timeout by increasing retry backoff."
```

## Import

```bash
<mm> import transcript ./path/to/session.jsonl
```

Transcript rows support:
- `timestamp`
- `sessionId`
- `role`
- `name`
- `content` or `summary`
- `tags`

## Export

```bash
<mm> export ./exports/shareable --redact
<mm> export profile claude ./profiles/claude --redact=strict
<mm> export profile codex ./profiles/codex
<mm> export profile cursor ./profiles/cursor
<mm> export skill <skillId> ./exports/review.skill.md --redact
```

## Reviewed Internal Skill Drafts

MemoryMesh also has an internal reviewed skill-pack system:

```bash
<mm> skills propose "repo-review-flow"
<mm> skills review
<mm> skills approve <skillId>
<mm> skills reject <skillId>
```

These internal reviewed skill packs are separate from this public Agent Skills package.
