import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryMeshApp } from "../src/app";
import { writeJsonAtomic, writeTextAtomic } from "../src/utils";

function createFixtureRepo(): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "memorymesh-proof-"));
  const fixtureRoot = path.join(import.meta.dir, "..", "bench", "fixtures", "basic");
  cpSync(fixtureRoot, repoRoot, { recursive: true });
  mkdirSync(path.join(repoRoot, ".claude"), { recursive: true });
  writeFileSync(path.join(repoRoot, ".claude", "settings.md"), "# Claude Settings\n\nPrefer concise cited answers.\n", "utf8");

  Bun.spawnSync({ cmd: ["git", "init"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "config", "user.email", "proof@example.com"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "config", "user.name", "Proof"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "add", "."], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "commit", "-m", "Initial proof fixture"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });

  return repoRoot;
}

const workspaceRoot = path.resolve(path.join(import.meta.dir, ".."));
const proofDir = path.join(workspaceRoot, "proof");
const repoRoot = createFixtureRepo();

const startInit = performance.now();
const { app, bootstrapReport } = MemoryMeshApp.init(repoRoot);
const initMs = performance.now() - startInit;

app.note("Proof note: MemoryMesh keeps local repo memory portable and cited.", "decision");

const startQuery = performance.now();
const result = app.query("What does this repo value?");
const queryMs = performance.now() - startQuery;

const startDoctor = performance.now();
const health = app.doctor();
const doctorMs = performance.now() - startDoctor;

writeJsonAtomic(path.join(proofDir, "benchmark-report.json"), {
  version: 1,
  generatedFrom: "bun run proof",
  fixture: "scripts/generate-proof.ts temporary repo",
  results: {
    bootstrapReport,
    timingMs: {
      init: Number(initMs.toFixed(2)),
      query: Number(queryMs.toFixed(2)),
      doctor: Number(doctorMs.toFixed(2)),
    },
    sampleAnswer: result.answer,
    citations: result.citations,
    health: {
      ok: health.ok,
      counts: health.counts,
    },
  },
});

writeTextAtomic(
  path.join(proofDir, "sample-retrieval.md"),
  [
    "# Sample Retrieval Transcript",
    "",
    "Query:",
    "",
    "```text",
    "What does this repo value?",
    "```",
    "",
    "Answer:",
    "",
    "```text",
    result.answer,
    "```",
    "",
    "Citations:",
    "",
    ...result.citations.map((citation) => `- \`${citation}\``),
    "",
  ].join("\n"),
);

app.close();
console.log("Updated proof/benchmark-report.json and proof/sample-retrieval.md");
