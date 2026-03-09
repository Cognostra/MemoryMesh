# Benchmarks

Benchmark scripts live in `bench/`.

The first public benchmark report should include:
- bootstrap scan time
- lexical search latency
- retrieval relevance on a curated query set
- failure-recovery behavior
- token reduction measurements for episode projections

Do not publish claims that are not generated from the scripts in this repository.

Example machine-readable report:
- [`proof/benchmark-report.json`](../proof/benchmark-report.json)

Regenerate proof artifacts with:

```bash
bun run proof
```

Run a reusable retrieval eval against a managed repo:

```bash
./bin/memorymesh eval bench/queries-memorymesh.json .
```

`bench/queries.json` is reserved for the checked-in benchmark fixture used by `bun run bench`.
