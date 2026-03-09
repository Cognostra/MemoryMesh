import path from "node:path";
import { readFileSync } from "node:fs";
import type {
  Episode,
  ExportOptions,
  ExportManifest,
  MemoryEvent,
  ProfileKind,
  SkillPackDraft,
  TranscriptRow,
} from "./types";
import { StorageEngine } from "./storage";
import {
  ensureDir,
  formatList,
  getRedactionPolicy,
  makeTempDir,
  nowMs,
  pathExists,
  randomId,
  redactText,
  redactValue,
  readJsonFile,
  readJsonLines,
  removeDir,
  sanitizeText,
  sha256,
  writeJsonAtomic,
  writeJsonLines,
  writeTextAtomic,
} from "./utils";

interface BundlePayload {
  manifest: ExportManifest;
  events: MemoryEvent[];
  episodes: Episode[];
  skills: SkillPackDraft[];
}

export class InteropService {
  constructor(
    private readonly repoRoot: string,
    private readonly repoId: string,
    private readonly storage: StorageEngine,
  ) {}

  exportBundle(outputPath: string, options?: ExportOptions): string {
    const isTar = outputPath.endsWith(".tar");
    const exportDir = isTar ? makeTempDir("memorymesh-export-") : outputPath;
    ensureDir(exportDir);
    const policy = getRedactionPolicy(options?.redactionPreset ?? "none");

    const payload: BundlePayload = {
      manifest: this.redactManifest(this.storage.getExportManifest(this.repoRoot, options), policy),
      events: this.storage.listEvents().map((event) => this.redactEvent(event, policy)),
      episodes: this.storage.listEpisodes().map((episode) => this.redactEpisode(episode, policy)),
      skills: this.storage.listSkills().map((skill) => this.redactSkill(skill, policy)),
    };

    writeJsonAtomic(path.join(exportDir, "manifest.json"), payload.manifest);
    writeJsonLines(path.join(exportDir, "events.jsonl"), payload.events);
    writeJsonLines(path.join(exportDir, "episodes.jsonl"), payload.episodes);
    writeJsonLines(path.join(exportDir, "skills.jsonl"), payload.skills);

    const overview = redactText(this.storage.getSetting<string>("overview") ?? "No overview available.", policy, this.repoRoot);
    writeTextAtomic(path.join(exportDir, "overview.md"), `${overview}\n`);

    if (!isTar) {
      return exportDir;
    }

    const tarProc = Bun.spawnSync({
      cmd: ["tar", "-cf", outputPath, "-C", exportDir, "."],
      stdout: "pipe",
      stderr: "pipe",
    });
    removeDir(exportDir);

    if (tarProc.exitCode !== 0) {
      throw new Error(`Failed to create tar archive: ${tarProc.stderr.toString().trim()}`);
    }

    return outputPath;
  }

  importBundle(inputPath: string): BundlePayload {
    const bundleDir = inputPath.endsWith(".tar") ? this.extractTar(inputPath) : inputPath;
    const manifest = readJsonFile<ExportManifest>(path.join(bundleDir, "manifest.json"));
    const events = readJsonLines<MemoryEvent>(path.join(bundleDir, "events.jsonl")).map((event) => ({
      ...event,
      repoId: this.repoId,
    }));
    const episodes = readJsonLines<Episode>(path.join(bundleDir, "episodes.jsonl")).map((episode) => ({
      ...episode,
      repoId: this.repoId,
    }));
    const skills = readJsonLines<SkillPackDraft>(path.join(bundleDir, "skills.jsonl")).map((skill) => ({
      ...skill,
      repoId: this.repoId,
    }));

    for (const event of events) {
      const known = this.storage.listEvents().some((row) => row.id === event.id);
      if (!known) {
        this.storage.appendEvent(event);
      }
    }

    for (const episode of episodes) {
      this.storage.upsertEpisode(episode);
    }

    for (const skill of skills) {
      this.storage.upsertSkill(skill);
    }

    const overviewPath = path.join(bundleDir, "overview.md");
    if (pathExists(overviewPath)) {
      this.storage.setSetting("overview", readFileSync(overviewPath, "utf8"));
    }

    if (inputPath.endsWith(".tar")) {
      removeDir(bundleDir);
    }

    return { manifest, events, episodes, skills };
  }

  importTranscript(inputPath: string): { importedEvents: number; sourceRef: string } {
    const resolvedPath = path.resolve(inputPath);
    const rows = readJsonLines<TranscriptRow>(resolvedPath);
    const checksum = sha256(readFileSync(resolvedPath, "utf8"));

    if (this.storage.hasImported("transcript", resolvedPath, checksum)) {
      return {
        importedEvents: 0,
        sourceRef: resolvedPath,
      };
    }

    let importedEvents = 0;
    const createdAt = nowMs();

    for (const row of rows) {
      const content = sanitizeText(String(row.summary ?? row.content ?? ""));
      if (!content) {
        continue;
      }

      const event: MemoryEvent = {
        id: randomId("evt"),
        repoId: this.repoId,
        source: "importer",
        kind: "tool_result",
        createdAt: this.resolveTimestamp(row.timestamp, createdAt + importedEvents),
        sessionId: row.sessionId ?? "imported-session",
        payloadJson: JSON.stringify({
          name: row.name ?? row.role ?? row.kind ?? "transcript",
          summary: content,
          role: row.role ?? null,
          kind: row.kind ?? null,
          citations: [row.sourceRef ?? `memorymesh://imports/${path.basename(resolvedPath)}`],
          sourceRef: row.sourceRef ?? resolvedPath,
        }),
        tags: ["transcript", ...(row.tags ?? [])],
      };

      this.storage.appendEvent(event);
      importedEvents += 1;
    }

    this.storage.recordImport("transcript", resolvedPath, checksum, createdAt);
    return {
      importedEvents,
      sourceRef: resolvedPath,
    };
  }

  exportSkillPack(skillId: string, outputPath?: string, options?: ExportOptions): string {
    const skill = this.storage.getSkill(skillId);
    if (!skill) {
      throw new Error(`Unknown skill: ${skillId}`);
    }

    const targetPath =
      outputPath && outputPath.trim()
        ? outputPath
        : path.join(this.storage.getBlobsDir(), "..", "exports", `${skill.name || skill.id}.skill.md`);

    const body = this.renderSkillPack(this.redactSkill(skill, getRedactionPolicy(options?.redactionPreset ?? "none")));
    writeTextAtomic(targetPath, body);
    return targetPath;
  }

  exportProfile(kind: ProfileKind, outputRoot: string, options?: ExportOptions): string[] {
    ensureDir(outputRoot);
    const policy = getRedactionPolicy(options?.redactionPreset ?? "none");
    const overview = redactText(this.storage.getSetting<string>("overview") ?? "No overview available.", policy, this.repoRoot);
    const approvedSkills = this.storage.listSkillsByStatus("approved").map((skill) => this.redactSkill(skill, policy));
    const recentEpisodes = this.storage.listRecentEpisodes(5).map((episode) => this.redactEpisode(episode, policy));
    const files: string[] = [];

    const skillSection =
      approvedSkills.length > 0
        ? approvedSkills
            .map((skill) => `## Skill: ${skill.name}\n\n${skill.description}\n\n${skill.stepsMarkdown}\n`)
            .join("\n")
        : "## Skills\n\nNo approved MemoryMesh skill packs yet.\n";

    const evidenceSection =
      recentEpisodes.length > 0
        ? `## Recent Evidence\n\n${recentEpisodes
            .map(
              (episode) =>
                `- ${episode.title}: ${episode.summary} (${episode.citationPaths.join(", ") || "no citations"})`,
            )
            .join("\n")}\n`
        : "## Recent Evidence\n\nNo recent episodes available.\n";

    if (kind === "claude") {
      const filePath = path.join(outputRoot, "CLAUDE.md");
      writeTextAtomic(
        filePath,
        `# Claude Project Memory\n\n## Overview\n\n${overview}\n\n${evidenceSection}\n${skillSection}`,
      );
      files.push(filePath);
      return files;
    }

    if (kind === "codex") {
      const filePath = path.join(outputRoot, "AGENTS.md");
      writeTextAtomic(
        filePath,
        `# AGENTS\n\n## MemoryMesh Overview\n\n${overview}\n\n${evidenceSection}\n${skillSection}`,
      );
      files.push(filePath);
      return files;
    }

    const rulesDir = path.join(outputRoot, ".cursor", "rules");
    ensureDir(rulesDir);
    const filePath = path.join(rulesDir, "memorymesh.md");
    writeTextAtomic(
      filePath,
      `# MemoryMesh Cursor Rules\n\n## Project Overview\n\n${overview}\n\n${evidenceSection}\n${skillSection}`,
    );
    files.push(filePath);
    return files;
  }

  private renderSkillPack(skill: SkillPackDraft): string {
    const frontMatter = [
      "---",
      `id: ${skill.id}`,
      `repoId: ${skill.repoId}`,
      `name: ${skill.name}`,
      `status: ${skill.status}`,
      `createdAt: ${new Date(skill.createdAt).toISOString()}`,
      "triggers:",
      ...skill.triggers.map((trigger) => `  - ${trigger}`),
      "prerequisites:",
      ...skill.prerequisites.map((item) => `  - ${item}`),
      "evidenceEpisodeIds:",
      ...skill.evidenceEpisodeIds.map((id) => `  - ${id}`),
      "---",
      "",
    ].join("\n");

    return [
      frontMatter,
      `# ${skill.name}`,
      "",
      skill.description,
      "",
      "## Triggers",
      formatList(skill.triggers),
      "",
      "## Prerequisites",
      formatList(skill.prerequisites),
      "",
      "## Steps",
      skill.stepsMarkdown,
      "",
      "## Validation",
      skill.validationMarkdown,
      "",
      "## Evidence",
      formatList(skill.evidenceEpisodeIds),
      "",
    ].join("\n");
  }

  private redactManifest(manifest: ExportManifest, policy: ReturnType<typeof getRedactionPolicy>): ExportManifest {
    if (policy.preset === "none") {
      return manifest;
    }

    return {
      ...manifest,
      sourceRepoRoot: path.basename(this.repoRoot) || "repo",
      redactionPreset: policy.preset,
    };
  }

  private redactEvent(event: MemoryEvent, policy: ReturnType<typeof getRedactionPolicy>): MemoryEvent {
    if (policy.preset === "none") {
      return event;
    }

    const payload = JSON.parse(event.payloadJson) as Record<string, unknown>;
    return {
      ...event,
      payloadJson: JSON.stringify(redactValue(payload, policy, this.repoRoot)),
      tags: event.tags.map((tag) => redactText(tag, policy, this.repoRoot)),
      blobRef: event.blobRef ? redactText(event.blobRef, policy, this.repoRoot) : null,
    };
  }

  private redactEpisode(episode: Episode, policy: ReturnType<typeof getRedactionPolicy>): Episode {
    if (policy.preset === "none") {
      return episode;
    }

    return {
      ...episode,
      title: redactText(episode.title, policy, this.repoRoot),
      summary: redactText(episode.summary, policy, this.repoRoot),
      decisions: episode.decisions.map((decision) => redactText(decision, policy, this.repoRoot)),
      resolutions: episode.resolutions.map((resolution) => redactText(resolution, policy, this.repoRoot)),
      tags: episode.tags.map((tag) => redactText(tag, policy, this.repoRoot)),
      citationPaths: episode.citationPaths.map((citation) => redactText(citation, policy, this.repoRoot)),
    };
  }

  private redactSkill(skill: SkillPackDraft, policy: ReturnType<typeof getRedactionPolicy>): SkillPackDraft {
    if (policy.preset === "none") {
      return skill;
    }

    return {
      ...skill,
      name: redactText(skill.name, policy, this.repoRoot),
      description: redactText(skill.description, policy, this.repoRoot),
      triggers: skill.triggers.map((trigger) => redactText(trigger, policy, this.repoRoot)),
      prerequisites: skill.prerequisites.map((item) => redactText(item, policy, this.repoRoot)),
      stepsMarkdown: redactText(skill.stepsMarkdown, policy, this.repoRoot),
      validationMarkdown: redactText(skill.validationMarkdown, policy, this.repoRoot),
    };
  }

  private extractTar(tarPath: string): string {
    const destDir = makeTempDir("memorymesh-import-");
    const proc = Bun.spawnSync({
      cmd: ["tar", "-xf", tarPath, "-C", destDir],
      stdout: "pipe",
      stderr: "pipe",
    });

    if (proc.exitCode !== 0) {
      removeDir(destDir);
      throw new Error(`Failed to extract tar archive: ${proc.stderr.toString().trim()}`);
    }

    return destDir;
  }

  private resolveTimestamp(timestamp: TranscriptRow["timestamp"], fallback: number): number {
    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
      return timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000;
    }

    if (typeof timestamp === "string" && timestamp.trim()) {
      const parsed = Date.parse(timestamp);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }
}
