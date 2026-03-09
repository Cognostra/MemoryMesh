import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RedactionPreset } from "./types";

export function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

export function pathExists(targetPath: string): boolean {
  return existsSync(targetPath);
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function writeJsonAtomic(filePath: string, value: unknown): void {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeTextAtomic(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, value, "utf8");
  renameSync(tempPath, filePath);
}

export function sha256(value: string | Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
}

export function nowMs(): number {
  return Date.now();
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

export function relativePosix(fromDir: string, targetPath: string): string {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
}

export function sanitizeText(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

export function wordCount(value: string): number {
  if (!value.trim()) {
    return 0;
  }

  return value.trim().split(/\s+/).length;
}

export function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(wordCount(value) * 0.75));
}

export function summarizeText(value: string, maxChars = 320): string {
  const cleaned = sanitizeText(value)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (cleaned.length === 0) {
    return "No summary available.";
  }

  const preferred = cleaned.find((line) => line.startsWith("#")) ?? cleaned[0];
  const collapsed = preferred.replace(/^#+\s*/, "");
  if (collapsed.length >= maxChars) {
    return `${collapsed.slice(0, maxChars - 1)}…`;
  }

  const extra = cleaned.slice(1).join(" ");
  const combined = extra ? `${collapsed} ${extra}` : collapsed;

  return combined.length > maxChars ? `${combined.slice(0, maxChars - 1)}…` : combined;
}

export function detectTextTags(relativePath: string): string[] {
  const tags = new Set<string>();
  const normalized = relativePath.toLowerCase();

  if (normalized.startsWith("docs/")) tags.add("docs");
  if (normalized.includes("agents.md")) tags.add("agent-instructions");
  if (normalized.includes("claude")) tags.add("claude");
  if (normalized.includes(".cursor/rules")) tags.add("cursor");
  if (normalized.includes("readme")) tags.add("readme");
  if (normalized.endsWith(".md")) tags.add("markdown");

  return [...tags];
}

export function walkFiles(rootDir: string): string[] {
  const results: string[] = [];
  const skipNames = new Set([".git", ".memorymesh", "node_modules"]);

  const visit = (currentDir: string): void => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (skipNames.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      results.push(fullPath);
    }
  };

  visit(rootDir);
  return results;
}

export function isTextImportCandidate(repoRoot: string, filePath: string): boolean {
  const relativePath = relativePosix(repoRoot, filePath);
  const normalized = relativePath.toLowerCase();

  if (normalized === "agents.md" || normalized === "claude.md") {
    return true;
  }

  if (normalized.startsWith(".claude/") || normalized.startsWith(".cursor/rules/")) {
    return true;
  }

  if (normalized.startsWith("docs/")) {
    return normalized.endsWith(".md") || normalized.endsWith(".txt");
  }

  return normalized.startsWith("readme");
}

export function readTextFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function runGit(cwd: string, args: string[]): GitCommandResult {
  const proc = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    ok: proc.exitCode === 0,
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
  };
}

export function tokenizeSearchQuery(query: string): string[] {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "are",
    "did",
    "does",
    "for",
    "how",
    "is",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "why",
    "with",
    "we",
  ]);

  return query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token));
}

export function writeJsonLines(filePath: string, rows: unknown[]): void {
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  writeTextAtomic(filePath, body ? `${body}\n` : "");
}

export function readJsonLines<T>(filePath: string): T[] {
  if (!pathExists(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function removeDir(targetPath: string): void {
  if (pathExists(targetPath)) {
    rmSync(targetPath, { recursive: true, force: true });
  }
}

export function fileSize(filePath: string): number {
  return statSync(filePath).size;
}

export function formatList(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

export interface RedactionPolicy {
  preset: RedactionPreset;
  redactEmails: boolean;
  redactCredentials: boolean;
  redactRepoPaths: boolean;
  redactLongTokens: boolean;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd|authorization)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const KNOWN_TOKEN_PATTERN =
  /\b(?:sk-[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g;
const STRICT_LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_=-]{32,}\b/g;

export function getRedactionPolicy(preset: RedactionPreset = "none"): RedactionPolicy {
  if (preset === "strict") {
    return {
      preset,
      redactEmails: true,
      redactCredentials: true,
      redactRepoPaths: true,
      redactLongTokens: true,
    };
  }

  if (preset === "safe") {
    return {
      preset,
      redactEmails: true,
      redactCredentials: true,
      redactRepoPaths: true,
      redactLongTokens: false,
    };
  }

  return {
    preset: "none",
    redactEmails: false,
    redactCredentials: false,
    redactRepoPaths: false,
    redactLongTokens: false,
  };
}

export function redactText(value: string, policy: RedactionPolicy, repoRoot?: string): string {
  let result = value;

  if (!result || policy.preset === "none") {
    return result;
  }

  if (policy.redactRepoPaths && repoRoot) {
    const normalizedRepoRoot = repoRoot.replaceAll("\\", "/");
    if (normalizedRepoRoot) {
      const repoToken = `<repo:${path.basename(repoRoot) || "project"}>`;
      result = result.replaceAll(repoRoot, repoToken);
      result = result.replaceAll(normalizedRepoRoot, repoToken);
    }
  }

  if (policy.redactEmails) {
    result = result.replaceAll(EMAIL_PATTERN, "<redacted:email>");
  }

  if (policy.redactCredentials) {
    result = result.replaceAll(SECRET_ASSIGNMENT_PATTERN, (_match, name: string, separator: string) => {
      return `${name}${separator}<redacted:secret>`;
    });
    result = result.replaceAll(KNOWN_TOKEN_PATTERN, "<redacted:token>");
  }

  if (policy.redactLongTokens) {
    result = result.replaceAll(STRICT_LONG_TOKEN_PATTERN, (token) => {
      if (token.startsWith("ep_") || token.startsWith("evt_") || token.startsWith("skill_") || token.startsWith("repo_")) {
        return token;
      }
      return "<redacted:token>";
    });
  }

  return result;
}

export function redactValue(value: unknown, policy: RedactionPolicy, repoRoot?: string): unknown {
  if (policy.preset === "none") {
    return value;
  }

  if (typeof value === "string") {
    return redactText(value, policy, repoRoot);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, policy, repoRoot));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, redactValue(child, policy, repoRoot)]),
    );
  }

  return value;
}
