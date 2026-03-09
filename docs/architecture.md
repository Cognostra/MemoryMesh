# Architecture

MemoryMesh v0.1 uses a narrow architecture:

- SQLite for metadata and projections
- filesystem blobs for large payloads and exports
- append-only raw events
- heuristic episode projections
- lexical retrieval with citations
- MCP stdio server and CLI entrypoints
- MCP tool/resource capture stored as raw local events, with result-side projection into episodes
- Session-aware aggregation for MCP result events so recent memory reflects workflows instead of isolated event fragments

The storage is repo-local inside `.memorymesh/`. The goal is durability, inspectability, and portability before feature breadth.
