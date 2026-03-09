import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MemoryMeshApp } from "../src/app";
import { createFixtureRepo } from "./helpers";

test("init bootstraps repo knowledge and returns cited query results", () => {
  const repoRoot = createFixtureRepo();
  const { app, bootstrapReport } = MemoryMeshApp.init(repoRoot);

  expect(bootstrapReport.importedFiles).toBeGreaterThan(0);
  expect(bootstrapReport.importedCommits).toBeGreaterThan(0);

  const result = app.query("What should an agent know?");
  expect(result.answer.length).toBeGreaterThan(0);
  expect(result.citations.length).toBeGreaterThan(0);
  expect(result.citations.some((citation) => citation.endsWith("AGENTS.md"))).toBe(true);

  app.close();
});

test("manual notes become searchable episodes", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);

  app.note("Fixed auth timeout by increasing retry backoff.", "error_resolution");
  const result = app.query("How did we fix the auth timeout?");

  expect(result.answer).toContain("auth timeout");
  expect(result.citations).toContain("memorymesh://notes");

  app.close();
});

test("exported bundles can be imported into another managed repo", () => {
  const sourceRoot = createFixtureRepo();
  const { app: sourceApp } = MemoryMeshApp.init(sourceRoot);
  sourceApp.note("Architectural decision: keep storage local-first.", "decision");

  const bundlePath = path.join(sourceRoot, "bundle");
  sourceApp.exportBundle(bundlePath);
  sourceApp.close();

  const targetRoot = createFixtureRepo();
  const { app: targetApp } = MemoryMeshApp.init(targetRoot);
  targetApp.importBundle(bundlePath);

  const result = targetApp.query("What architectural decision exists?");
  expect(result.answer).toContain("Architectural decision");

  targetApp.close();
});

test("approved skill packs can be exported as markdown", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);

  app.note("Decision one: keep storage local-first.", "decision");
  app.note("Decision two: keep answers cited.", "decision");
  app.note("Decision three: prefer Bun and SQLite.", "decision");

  const draft = app.proposeSkill("local-review-flow");
  expect(draft).not.toBeNull();
  const approved = app.updateSkillStatus(draft!.id, "approved");
  expect(approved?.status).toBe("approved");

  const skillPath = path.join(repoRoot, "exports", "local-review-flow.skill.md");
  const exportedPath = app.exportSkillPack(draft!.id, skillPath);
  expect(exportedPath).toBe(skillPath);
  expect(existsSync(skillPath)).toBe(true);

  const body = readFileSync(skillPath, "utf8");
  expect(body).toContain("status: approved");
  expect(body).toContain("## Steps");
  expect(body).toContain("## Validation");

  app.close();
});

test("profile export writes file-based outputs for supported surfaces", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);

  app.note("Decision one: keep storage local-first.", "decision");
  app.note("Decision two: keep answers cited.", "decision");
  app.note("Decision three: prefer Bun and SQLite.", "decision");
  const draft = app.proposeSkill("portable-profile-flow");
  expect(draft).not.toBeNull();
  app.updateSkillStatus(draft!.id, "approved");

  const claudeDir = path.join(repoRoot, "profile-claude");
  const codexDir = path.join(repoRoot, "profile-codex");
  const cursorDir = path.join(repoRoot, "profile-cursor");

  const claudeFiles = app.exportProfile("claude", claudeDir);
  const codexFiles = app.exportProfile("codex", codexDir);
  const cursorFiles = app.exportProfile("cursor", cursorDir);

  expect(claudeFiles[0]).toContain("CLAUDE.md");
  expect(codexFiles[0]).toContain("AGENTS.md");
  expect(cursorFiles[0]).toContain(path.join(".cursor", "rules", "memorymesh.md"));

  expect(readFileSync(claudeFiles[0], "utf8")).toContain("Project Memory");
  expect(readFileSync(codexFiles[0], "utf8")).toContain("MemoryMesh Overview");
  expect(readFileSync(cursorFiles[0], "utf8")).toContain("Cursor Rules");

  app.close();
});

test("redacted exports scrub secrets, emails, and repo paths", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);

  app.note(
    `Escalation contact dev@example.com. Token=ghp_abcdefghijklmnopqrstuvwxyz123456 Mirror ghp_zyxwvutsrqponmlkjihgfedcba654321 Store repo path ${repoRoot}/docs/architecture.md`,
    "decision",
  );

  const bundlePath = path.join(repoRoot, "bundle-redacted");
  app.exportBundle(bundlePath, { redactionPreset: "safe" });

  const manifest = JSON.parse(readFileSync(path.join(bundlePath, "manifest.json"), "utf8")) as {
    sourceRepoRoot: string;
    redactionPreset: string;
  };
  const eventsBody = readFileSync(path.join(bundlePath, "events.jsonl"), "utf8");
  const overviewBody = readFileSync(path.join(bundlePath, "overview.md"), "utf8");

  expect(manifest.redactionPreset).toBe("safe");
  expect(manifest.sourceRepoRoot).toBe(path.basename(repoRoot));
  expect(eventsBody).not.toContain("dev@example.com");
  expect(eventsBody).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
  expect(eventsBody).not.toContain(repoRoot);
  expect(eventsBody).toContain("<redacted:email>");
  expect(eventsBody).toContain("<redacted:secret>");
  expect(eventsBody).toContain("<redacted:token>");
  expect(overviewBody).toContain("<repo:");

  app.close();
});

test("redacted profile export scrubs sensitive evidence", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);

  app.note(
    "Customer email ops@example.com fixed with password=hunter2 and standalone sk-secretvalue1234567890.",
    "error_resolution",
  );

  const profileDir = path.join(repoRoot, "profile-redacted");
  const [profilePath] = app.exportProfile("claude", profileDir, { redactionPreset: "safe" });
  const body = readFileSync(profilePath, "utf8");

  expect(body).toContain("<redacted:email>");
  expect(body).toContain("<redacted:secret>");
  expect(body).toContain("<redacted:token>");
  expect(body).not.toContain("ops@example.com");
  expect(body).not.toContain("hunter2");

  app.close();
});

test("tar bundles round-trip correctly", () => {
  const sourceRoot = createFixtureRepo();
  const { app: sourceApp } = MemoryMeshApp.init(sourceRoot);
  sourceApp.note("Decision: support tar exports for portability.", "decision");

  const tarPath = path.join(sourceRoot, "bundle.tar");
  sourceApp.exportBundle(tarPath);
  sourceApp.close();

  const targetRoot = createFixtureRepo();
  const { app: targetApp } = MemoryMeshApp.init(targetRoot);
  targetApp.importBundle(tarPath);
  const result = targetApp.query("tar exports");

  expect(result.answer).toContain("tar exports");
  targetApp.close();
});

test("transcript imports create retrievable local memory", () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);

  const transcriptPath = path.join(repoRoot, "session.jsonl");
  Bun.write(
    transcriptPath,
    [
      JSON.stringify({
        timestamp: "2026-03-09T12:00:00Z",
        sessionId: "sess_demo",
        role: "assistant",
        name: "summary",
        content: "Refactored the storage layer to keep writes local-first.",
        tags: ["refactor", "storage"],
      }),
      JSON.stringify({
        timestamp: "2026-03-09T12:05:00Z",
        sessionId: "sess_demo",
        role: "assistant",
        name: "fix",
        content: "Fixed MCP config generation to point at the installed binary path.",
        tags: ["mcp", "fix"],
      }),
    ].join("\n") + "\n",
  );

  const report = app.importTranscript(transcriptPath);
  expect(report.importedEvents).toBe(2);

  const result = app.query("How was MCP config fixed?");
  expect(result.answer).toContain("installed binary path");
  expect(result.citations.some((citation) => citation.includes("memorymesh://imports/session.jsonl"))).toBe(true);

  app.close();
});
