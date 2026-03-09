# Contributing

## Local Setup

- Install Bun 1.3+
- Clone the repository
- Run `bun run docs:check`
- Run `bun test`
- Run `bun run bench`
- Run `bun run proof`

## Development Priorities

Contributions should reinforce the product promise:
- local-first
- cited retrieval
- portable exports
- MCP-native coding agent workflows

Please avoid broadening scope with:
- vendor-private memory sync
- graph infrastructure
- unbenchmarked performance claims
- mandatory local-model dependencies

## Before Opening a PR

1. Read [`README.md`](./README.md).
2. Read [`docs/architecture.md`](./docs/architecture.md) and [`docs/quickstart.md`](./docs/quickstart.md).
3. Run `bun run docs:check`.
4. Run `bun test`.
5. If you changed retrieval, storage, or UX claims, run `bun run bench` and `bun run proof`.

## Pull Request Expectations

- Keep changes focused.
- Update docs when behavior changes.
- Add or update tests when behavior changes.
- Do not add marketing claims without proof artifacts in the repo.

## Good First Contributions

- Improve retrieval ranking without breaking citations
- Expand bootstrap importers conservatively
- Improve bundle/profile export ergonomics
- Add eval fixtures or benchmark coverage
- Tighten error messages and doctor output
