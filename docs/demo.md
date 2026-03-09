# Demo

## Golden Demo

1. Open a repository that has `README.md`, `AGENTS.md`, and `CLAUDE.md`.
2. Run `./bin/memorymesh init`.
3. Ask one MCP-native coding client for the repo conventions.
4. Show the cited result.
5. Switch to another client.
6. Ask the same question and show materially the same cited answer.
7. Run `./bin/memorymesh note "Fixed auth timeout by increasing retry backoff"`.
8. Ask for the auth-timeout history and show the cited note.
9. Optionally show `./bin/memorymesh recent` after MCP usage to demonstrate that MemoryMesh captured its own tool interactions locally.

The ideal public demo is 30-60 seconds long and uses a real repository instead of a toy prompt.
