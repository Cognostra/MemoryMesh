import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const skillsRoot = path.join(repoRoot, "skills");
const failures: string[] = [];

if (!existsSync(skillsRoot)) {
  failures.push("skills/: missing repository skills directory");
} else {
  const skillDirs = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (skillDirs.length === 0) {
    failures.push("skills/: no public skills found");
  }

  for (const skillName of skillDirs) {
    validateSkill(skillName);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Skills check passed.\n");

function validateSkill(skillName: string): void {
  const skillDir = path.join(skillsRoot, skillName);
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const openAiYamlPath = path.join(skillDir, "agents", "openai.yaml");

  if (existsSync(path.join(skillDir, "README.md"))) {
    failures.push(`${relative(skillDir)}: README.md should not exist inside a skill package`);
  }

  if (!existsSync(skillMdPath)) {
    failures.push(`${relative(skillDir)}: missing SKILL.md`);
    return;
  }

  const skillBody = readFileSync(skillMdPath, "utf8");
  const frontmatterMatch = skillBody.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    failures.push(`${relative(skillMdPath)}: missing YAML frontmatter`);
    return;
  }

  const frontmatter = frontmatterMatch[1];
  const name = matchField(frontmatter, "name");
  const description = matchField(frontmatter, "description");

  if (!name) {
    failures.push(`${relative(skillMdPath)}: frontmatter missing name`);
  } else if (name !== skillName) {
    failures.push(`${relative(skillMdPath)}: frontmatter name must match folder name (${skillName})`);
  }

  if (!description) {
    failures.push(`${relative(skillMdPath)}: frontmatter missing description`);
  } else {
    if (description.length < 80) {
      failures.push(`${relative(skillMdPath)}: description is too short to trigger reliably`);
    }
    if (/[<>]/.test(description) || /TODO|placeholder/i.test(description)) {
      failures.push(`${relative(skillMdPath)}: description contains placeholder text`);
    }
  }

  if (!skillBody.includes("## When to Use")) {
    failures.push(`${relative(skillMdPath)}: expected a "## When to Use" section`);
  }

  if (!skillBody.includes("## Safety Rules")) {
    failures.push(`${relative(skillMdPath)}: expected a "## Safety Rules" section`);
  }

  for (const link of extractMarkdownLinks(skillBody)) {
    if (link.startsWith("http://") || link.startsWith("https://") || link.startsWith("mailto:")) {
      continue;
    }

    const [linkPath] = link.split("#", 1);
    if (!linkPath) {
      continue;
    }

    const resolved = path.resolve(path.dirname(skillMdPath), linkPath);
    if (!existsSync(resolved)) {
      failures.push(`${relative(skillMdPath)}: broken local link ${link}`);
    }
  }

  if (!existsSync(openAiYamlPath)) {
    failures.push(`${relative(skillDir)}: missing agents/openai.yaml`);
  } else {
    validateOpenAiYaml(openAiYamlPath, skillName);
  }

  const checkScriptPath = path.join(skillDir, "scripts", "check-memorymesh.sh");
  if (!existsSync(checkScriptPath)) {
    failures.push(`${relative(skillDir)}: missing scripts/check-memorymesh.sh`);
  } else if ((statSync(checkScriptPath).mode & 0o111) === 0) {
    failures.push(`${relative(checkScriptPath)}: helper script must be executable`);
  }
}

function validateOpenAiYaml(filePath: string, skillName: string): void {
  const body = readFileSync(filePath, "utf8");
  const displayName = matchYamlField(body, "display_name");
  const shortDescription = matchYamlField(body, "short_description");
  const defaultPrompt = matchYamlField(body, "default_prompt");

  if (!displayName) {
    failures.push(`${relative(filePath)}: missing interface.display_name`);
  }

  if (!shortDescription) {
    failures.push(`${relative(filePath)}: missing interface.short_description`);
  } else if (shortDescription.length < 25 || shortDescription.length > 64) {
    failures.push(`${relative(filePath)}: short_description must be 25-64 characters`);
  }

  if (!defaultPrompt) {
    failures.push(`${relative(filePath)}: missing interface.default_prompt`);
  } else if (!defaultPrompt.includes(`$${skillName}`)) {
    failures.push(`${relative(filePath)}: default_prompt must mention $${skillName}`);
  }
}

function matchField(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^"|"$/g, "") : null;
}

function matchYamlField(body: string, key: string): string | null {
  const match = body.match(new RegExp(`^\\s*${key}:\\s*"?(.+?)"?$`, "m"));
  return match ? match[1].trim() : null;
}

function extractMarkdownLinks(body: string): string[] {
  return [...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function relative(targetPath: string): string {
  return path.relative(repoRoot, targetPath);
}
