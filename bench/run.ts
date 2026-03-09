import { cpSync, mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryMeshApp } from "../src/app";
import type { QueryResult } from "../src/types";

interface BenchQuery {
  id: string;
  query: string;
  expectsCitation: string;
}

function createFixtureRepo(): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "memorymesh-bench-"));
  const fixtureRoot = path.join(import.meta.dir, "fixtures", "basic");
  cpSync(fixtureRoot, repoRoot, { recursive: true });
  mkdirSync(path.join(repoRoot, ".claude"), { recursive: true });
  Bun.write(path.join(repoRoot, ".claude", "settings.md"), "# Claude Settings\n\nPrefer cited answers.\n");

  Bun.spawnSync({ cmd: ["git", "init"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "config", "user.email", "bench@example.com"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "config", "user.name", "Bench"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "add", "."], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "commit", "-m", "Initial fixture"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });

  return repoRoot;
}

function loadQueries(): BenchQuery[] {
  return JSON.parse(readFileSync(path.join(import.meta.dir, "queries.json"), "utf8")) as BenchQuery[];
}

function summarizeQueryResult(query: BenchQuery, result: QueryResult): Record<string, unknown> {
  return {
    id: query.id,
    query: query.query,
    answer: result.answer,
    citations: result.citations,
    matchedExpectedCitation: result.citations.includes(query.expectsCitation),
  };
}

const repoRoot = createFixtureRepo();
const queries = loadQueries();

const startInit = performance.now();
const { app, bootstrapReport } = MemoryMeshApp.init(repoRoot);
const initMs = performance.now() - startInit;

const queryResults = queries.map((query) => {
  const started = performance.now();
  const result = app.query(query.query);
  const elapsedMs = performance.now() - started;
  return {
    elapsedMs: Number(elapsedMs.toFixed(2)),
    ...summarizeQueryResult(query, result),
  };
});

const queryMs =
  queryResults.reduce((total, row) => total + Number(row.elapsedMs), 0) /
  Math.max(1, queryResults.length);

const startDoctor = performance.now();
const health = app.doctor();
const doctorMs = performance.now() - startDoctor;

console.log(
  JSON.stringify(
    {
      bootstrapReport,
      timingMs: {
        init: Number(initMs.toFixed(2)),
        queryAverage: Number(queryMs.toFixed(2)),
        doctor: Number(doctorMs.toFixed(2)),
      },
      queryResults,
      health,
    },
    null,
    2,
  ),
);

app.close();
