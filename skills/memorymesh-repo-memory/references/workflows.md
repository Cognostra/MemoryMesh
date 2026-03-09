# Workflows Reference

## First-Time Bootstrap

1. Detect whether MemoryMesh is available with `scripts/check-memorymesh.sh`.
2. If missing, show the install options from [install reference](./install.md).
3. Run `<mm> init`.
4. Run `<mm> query "What conventions does this repo follow?"`.
5. If the user wants agent integration, run `<mm> mcp-config`.

## Answer a Repo-Memory Question

Use this flow when the user asks about conventions, prior fixes, or recent decisions:

1. Query MemoryMesh first.
2. Prefer cited MemoryMesh results over recollection.
3. If MemoryMesh has no useful result yet, say that clearly and fall back to repo files or git history.

Example prompts:
- "What should an agent know before editing this repo?"
- "How did we solve the auth timeout bug?"
- "What changed in the last few sessions?"

## Record New Memory After Work

Use this flow after a meaningful fix or decision:

1. Write the code change.
2. Verify the change normally.
3. Record the outcome with `<mm> note "..."`.
4. Use `decision` or `error_resolution` only when the MemoryMesh surface supports it directly; otherwise keep the note explicit and concise.

Good note content:
- what changed
- why it changed
- the failure or decision being captured

## Safe Export and Sharing

Use redacted export by default when content is leaving the repo or team boundary:

```bash
<mm> export ./exports/shareable --redact
<mm> export profile claude ./profiles/claude --redact=strict
<mm> export skill <skillId> ./exports/review.skill.md --redact
```

Use `safe` redaction for normal sharing and `strict` when credentials or copied tokens may appear in notes or transcripts.
