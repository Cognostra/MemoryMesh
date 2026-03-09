import path from "node:path";
import { BootstrapEngine } from "./bootstrap";
import { APP_VERSION, getRepoPaths, MEMORYMESH_DIR, type RepoPaths } from "./config";
import { Doctor } from "./doctor";
import { InteropService } from "./interop";
import { ProjectionWorker } from "./projection";
import { RetrievalEngine } from "./retrieval";
import { StorageEngine } from "./storage";
import type {
  BootstrapReport,
  ExportOptions,
  HealthCheckResult,
  MemoryEvent,
  ProfileKind,
  QueryResult,
  RepoConfig,
  SkillPackDraft,
  SkillStatus,
  StatusReport,
} from "./types";
import {
  ensureDir,
  nowMs,
  pathExists,
  randomId,
  readJsonFile,
  relativePosix,
  runGit,
  writeJsonAtomic,
} from "./utils";

export class MemoryMeshApp {
  readonly projection: ProjectionWorker;
  readonly bootstrapEngine: BootstrapEngine;
  readonly retrieval: RetrievalEngine;
  readonly interop: InteropService;
  readonly doctorService: Doctor;

  constructor(
    readonly repoRoot: string,
    readonly paths: RepoPaths,
    readonly repoConfig: RepoConfig,
    readonly storage: StorageEngine,
  ) {
    this.projection = new ProjectionWorker(storage);
    this.bootstrapEngine = new BootstrapEngine(repoRoot, repoConfig, storage, this.projection);
    this.retrieval = new RetrievalEngine(storage);
    this.interop = new InteropService(repoRoot, repoConfig.repoId, storage);
    this.doctorService = new Doctor(paths, storage);
  }

  static init(repoRootInput: string): { app: MemoryMeshApp; bootstrapReport: BootstrapReport } {
    const repoRoot = path.resolve(repoRootInput);
    const paths = getRepoPaths(repoRoot);
    ensureDir(paths.memoryDir);
    ensureDir(paths.exportsDir);
    ensureDir(paths.logsDir);
    ensureDir(paths.blobsDir);

    const repoConfig = pathExists(paths.repoConfigPath)
      ? readJsonFile<RepoConfig>(paths.repoConfigPath)
      : MemoryMeshApp.createRepoConfig(repoRoot);

    repoConfig.updatedAt = nowMs();
    writeJsonAtomic(paths.repoConfigPath, repoConfig);

    const storage = new StorageEngine(paths.dbPath, repoConfig.repoId, paths.blobsDir, false);
    storage.initialize();

    const app = new MemoryMeshApp(repoRoot, paths, repoConfig, storage);
    const bootstrapReport = app.bootstrap();
    return { app, bootstrapReport };
  }

  static open(startDirInput = process.cwd(), readOnly = false): MemoryMeshApp {
    const repoRoot = MemoryMeshApp.findManagedRepoRoot(path.resolve(startDirInput));
    if (!repoRoot) {
      throw new Error(`No ${MEMORYMESH_DIR} directory found from ${startDirInput}`);
    }

    const paths = getRepoPaths(repoRoot);
    const repoConfig = readJsonFile<RepoConfig>(paths.repoConfigPath);
    const storage = new StorageEngine(paths.dbPath, repoConfig.repoId, paths.blobsDir, readOnly);
    storage.initialize();
    return new MemoryMeshApp(repoRoot, paths, repoConfig, storage);
  }

  static findManagedRepoRoot(startDir: string): string | null {
    let currentDir = startDir;

    while (true) {
      const candidate = path.join(currentDir, MEMORYMESH_DIR, "repo.json");
      if (pathExists(candidate)) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        return null;
      }
      currentDir = parentDir;
    }
  }

  static createRepoConfig(repoRoot: string): RepoConfig {
    const remotes = runGit(repoRoot, ["remote", "-v"]);
    const defaultBranch = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const gitRoot = runGit(repoRoot, ["rev-parse", "--show-toplevel"]);
    const timestamp = nowMs();

    return {
      version: 1,
      repoId: randomId("repo"),
      repoRoot,
      createdAt: timestamp,
      updatedAt: timestamp,
      fingerprints: {
        gitRoot: gitRoot.ok ? gitRoot.stdout : null,
        remotes: remotes.ok
          ? [...new Set(remotes.stdout.split("\n").map((line) => line.trim()).filter(Boolean))]
          : [],
        defaultBranch: defaultBranch.ok ? defaultBranch.stdout : null,
        initializedAt: timestamp,
      },
    };
  }

  close(): void {
    this.storage.close();
  }

  bootstrap(): BootstrapReport {
    return this.bootstrapEngine.run();
  }

  note(content: string, kind: "note" | "decision" | "error_resolution" = "note"): void {
    const createdAt = nowMs();
    const event: MemoryEvent = {
      id: randomId("evt"),
      repoId: this.repoConfig.repoId,
      source: "manual",
      kind,
      createdAt,
      payloadJson: JSON.stringify({
        content,
      }),
      tags: ["manual"],
    };

    this.storage.appendEvent(event);
    this.projection.projectPendingEvents();
  }

  recordMcpEvent(
    kind: "tool_call" | "tool_result",
    payload: Record<string, unknown>,
    options?: {
      sessionId?: string;
      tags?: string[];
      projectNow?: boolean;
    },
  ): void {
    const event: MemoryEvent = {
      id: randomId("evt"),
      repoId: this.repoConfig.repoId,
      source: "mcp",
      kind,
      createdAt: nowMs(),
      sessionId: options?.sessionId ?? null,
      payloadJson: JSON.stringify(payload),
      tags: ["mcp", ...(options?.tags ?? [])],
    };

    this.storage.appendEvent(event);
    if (options?.projectNow ?? false) {
      this.projection.projectPendingEvents();
    }
  }

  query(text: string, limit = 5): QueryResult {
    return this.retrieval.query(text, limit);
  }

  status(): StatusReport {
    const overview = this.storage.getSetting<string>("overview") ?? "No overview available.";
    return {
      repoId: this.repoConfig.repoId,
      repoRoot: this.repoRoot,
      overview,
      suggestedPaths: this.getSuggestedPaths(),
      counts: this.storage.getCounts(),
    };
  }

  doctor(): HealthCheckResult {
    return this.doctorService.run();
  }

  exportBundle(outputPath: string, options?: ExportOptions): string {
    return this.interop.exportBundle(path.resolve(outputPath), options);
  }

  importBundle(inputPath: string): void {
    this.interop.importBundle(path.resolve(inputPath));
  }

  importTranscript(inputPath: string): { importedEvents: number; sourceRef: string } {
    const result = this.interop.importTranscript(path.resolve(inputPath));
    this.projection.projectPendingEvents();
    return result;
  }

  proposeSkill(name?: string): SkillPackDraft | null {
    return this.projection.proposeSkill(name);
  }

  listSkills(): SkillPackDraft[] {
    return this.storage.listSkills();
  }

  updateSkillStatus(skillId: string, status: SkillStatus): SkillPackDraft | null {
    return this.storage.updateSkillStatus(skillId, status);
  }

  exportSkillPack(skillId: string, outputPath?: string, options?: ExportOptions): string {
    return this.interop.exportSkillPack(skillId, outputPath ? path.resolve(outputPath) : undefined, options);
  }

  exportProfile(kind: ProfileKind, outputPath: string, options?: ExportOptions): string[] {
    return this.interop.exportProfile(kind, path.resolve(outputPath), options);
  }

  getOverview(): string {
    return this.storage.getSetting<string>("overview") ?? "No overview available.";
  }

  getRecentEpisodes(limit = 5): ReturnType<StorageEngine["listRecentEpisodes"]> {
    return this.storage.listRecentEpisodes(limit);
  }

  getMcpConfigSnippet(commandPath: string): string {
    const absoluteCommand = path.resolve(commandPath);
    return JSON.stringify(
      {
        mcpServers: {
          memorymesh: {
            command: absoluteCommand,
            args: ["serve", this.repoRoot],
          },
        },
      },
      null,
      2,
    );
  }

  getSuggestedPaths(): string[] {
    const candidates = [
      path.join(this.repoRoot, "AGENTS.md"),
      path.join(this.repoRoot, "CLAUDE.md"),
      path.join(this.repoRoot, "README.md"),
    ];

    return candidates
      .filter((candidate) => pathExists(candidate))
      .map((candidate) => relativePosix(this.repoRoot, candidate));
  }

  getVersion(): string {
    return APP_VERSION;
  }
}
