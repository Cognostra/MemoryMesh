import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

interface PackageJsonShape {
  repository?: {
    url?: string;
  };
}

const repoRoot = path.resolve(import.meta.dir, "..");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as PackageJsonShape;
const repositoryUrl = packageJson.repository?.url ?? "";
const repositorySlug = extractGithubSlug(repositoryUrl);

if (!repositorySlug) {
  throw new Error("package.json repository.url must point to a GitHub repository.");
}

const markdownFiles = collectMarkdownFiles(repoRoot);
const failures: string[] = [];
const bannedTokens = [
  "gevorian/MemoryMesh",
  "IMPLEMENTATION_PROMPT.md",
  "Mmesh.prd",
];

for (const filePath of markdownFiles) {
  const absolutePath = path.join(repoRoot, filePath);
  const body = readFileSync(absolutePath, "utf8");

  for (const token of bannedTokens) {
    if (body.includes(token)) {
      failures.push(`${filePath}: contains banned token "${token}"`);
    }
  }

  for (const link of extractMarkdownLinks(body)) {
    if (link.startsWith("http://") || link.startsWith("https://") || link.startsWith("mailto:")) {
      continue;
    }

    const [linkPath] = link.split("#", 1);
    if (!linkPath || linkPath === "") {
      continue;
    }

    const resolved = path.resolve(path.dirname(absolutePath), linkPath);
    if (!existsSync(resolved)) {
      failures.push(`${filePath}: broken local link ${link}`);
    }
  }

  validateRepoUrls(filePath, body, repositorySlug, failures);
  validateMemoryMeshCommands(filePath, body, failures);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Docs check passed for ${markdownFiles.length} files.\n`);

function extractGithubSlug(url: string): string | null {
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);
  return match ? match[1] : null;
}

function collectMarkdownFiles(rootDir: string): string[] {
  const targets = [
    "README.md",
    "CONTRIBUTING.md",
    "docs",
    "bench",
    "examples",
    ".github/ISSUE_TEMPLATE",
    ".github/pull_request_template.md",
  ];

  const files: string[] = [];

  for (const target of targets) {
    const absoluteTarget = path.join(rootDir, target);
    if (!existsSync(absoluteTarget)) {
      continue;
    }

    if (absoluteTarget.endsWith(".md")) {
      files.push(path.relative(rootDir, absoluteTarget));
      continue;
    }

    visitMarkdownFiles(absoluteTarget, rootDir, files);
  }

  return files.sort();
}

function visitMarkdownFiles(currentPath: string, rootDir: string, files: string[]): void {
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      visitMarkdownFiles(entryPath, rootDir, files);
      continue;
    }

    if (entry.name.endsWith(".md")) {
      files.push(path.relative(rootDir, entryPath));
    }
  }
}

function extractMarkdownLinks(body: string): string[] {
  return [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function validateRepoUrls(filePath: string, body: string, repositorySlug: string, failures: string[]): void {
  for (const match of body.matchAll(/https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/scripts\/install\.sh/g)) {
    if (match[1] !== repositorySlug) {
      failures.push(`${filePath}: install URL uses ${match[1]} instead of ${repositorySlug}`);
    }
  }

  for (const match of body.matchAll(/MEMORYMESH_REPO=([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
    if (match[1] !== repositorySlug) {
      failures.push(`${filePath}: MEMORYMESH_REPO example uses ${match[1]} instead of ${repositorySlug}`);
    }
  }
}

function validateMemoryMeshCommands(filePath: string, body: string, failures: string[]): void {
  const allowedTopLevel = new Set([
    "init",
    "serve",
    "status",
    "mcp-config",
    "overview",
    "recent",
    "eval",
    "query",
    "note",
    "bootstrap",
    "export",
    "import",
    "doctor",
    "skills",
  ]);

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("./bin/memorymesh ")) {
      continue;
    }

    const parts = trimmed.replace("./bin/memorymesh ", "").trim().split(/\s+/);
    const topLevel = parts[0];
    const subcommand = parts[1];

    if (topLevel === "--help" || topLevel === "help") {
      continue;
    }

    if (!allowedTopLevel.has(topLevel)) {
      failures.push(`${filePath}: unknown MemoryMesh command in docs: ${trimmed}`);
      continue;
    }

    if (topLevel === "export" && subcommand && !subcommand.startsWith("<") && !["profile", "skill"].includes(subcommand) && !subcommand.startsWith("./")) {
      failures.push(`${filePath}: invalid export command in docs: ${trimmed}`);
    }

    if (topLevel === "import" && subcommand && !subcommand.startsWith("<") && subcommand !== "transcript" && !subcommand.startsWith("./")) {
      failures.push(`${filePath}: invalid import command in docs: ${trimmed}`);
    }

    if (topLevel === "skills" && subcommand && !["review", "propose", "approve", "reject"].includes(subcommand)) {
      failures.push(`${filePath}: invalid skills command in docs: ${trimmed}`);
    }
  }
}
