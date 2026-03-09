import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function createFixtureRepo(): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "memorymesh-test-"));
  mkdirSync(path.join(repoRoot, "docs"), { recursive: true });
  mkdirSync(path.join(repoRoot, ".claude"), { recursive: true });
  mkdirSync(path.join(repoRoot, ".cursor", "rules"), { recursive: true });

  writeFileSync(
    path.join(repoRoot, "README.md"),
    "# Test Repo\n\nThis repo uses Bun and expects cited retrieval.\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoRoot, "AGENTS.md"),
    "# Agent Instructions\n\nAlways preserve docs and keep changes local-first.\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoRoot, "CLAUDE.md"),
    "# Claude Memory\n\nSurface cited context and recent fixes.\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoRoot, "docs", "architecture.md"),
    "# Architecture\n\nMemory is stored in SQLite and exported as bundles.\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoRoot, ".claude", "settings.md"),
    "# Claude Settings\n\nPrefer concise answers.\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoRoot, ".cursor", "rules", "style.md"),
    "# Cursor Rules\n\nPrefer TypeScript and avoid hidden state.\n",
    "utf8",
  );

  Bun.spawnSync({ cmd: ["git", "init"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "config", "user.email", "tests@example.com"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "config", "user.name", "Tests"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "add", "."], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync({ cmd: ["git", "commit", "-m", "Initial commit"], cwd: repoRoot, stdout: "ignore", stderr: "ignore" });

  return repoRoot;
}
