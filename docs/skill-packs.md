# Skill Packs

MemoryMesh uses "skill" in two different ways:

- Public Agent Skills packages in [`skills/`](../skills/) for the Skills CLI and skills.sh discovery
- Internal reviewed skill packs exported by MemoryMesh itself

This page describes the internal reviewed skill packs.

MemoryMesh skill packs are reviewed portable artifacts.

They are:
- Markdown files with front matter
- linked back to supporting episodes
- intended for review and reuse
- exportable with `memorymesh export skill <skillId>`

They are not:
- hidden prompt injection
- automatic code execution
- silently installed into third-party tools

Typical flow:

```bash
./bin/memorymesh skills propose "repo-review-flow"
./bin/memorymesh skills review
./bin/memorymesh skills approve <skillId>
./bin/memorymesh export skill <skillId> ./exports/repo-review-flow.skill.md
./bin/memorymesh export skill <skillId> ./exports/repo-review-flow.shareable.skill.md --redact
```
