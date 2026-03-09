import { expect, test } from "bun:test";
import { MemoryMeshApp } from "../src/app";
import { runEval } from "../src/eval";
import { createFixtureRepo } from "./helpers";

test("eval reports expected citation matches for a managed repo", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);
  app.close();

  const report = runEval("bench/queries.json", repoRoot);
  expect(report.totalQueries).toBe(3);
  expect(report.matchedExpectedCitationCount).toBeGreaterThanOrEqual(2);
});
