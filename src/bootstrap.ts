import path from "node:path";
import type { BootstrapReport, MemoryEvent, RepoConfig } from "./types";
import { ProjectionWorker } from "./projection";
import { StorageEngine } from "./storage";
import {
  detectTextTags,
  fileSize,
  isTextImportCandidate,
  nowMs,
  randomId,
  readTextFile,
  relativePosix,
  runGit,
  sha256,
  summarizeText,
  walkFiles,
  writeTextAtomic,
} from "./utils";

const INLINE_TEXT_LIMIT = 16_000;

export class BootstrapEngine {
  constructor(
    private readonly repoRoot: string,
    private readonly repoConfig: RepoConfig,
    private readonly storage: StorageEngine,
    private readonly projection: ProjectionWorker,
  ) {}

  run(): BootstrapReport {
    let importedFiles = 0;
    let importedCommits = 0;
    let skippedImports = 0;

    for (const filePath of walkFiles(this.repoRoot)) {
      if (!isTextImportCandidate(this.repoRoot, filePath)) {
        continue;
      }

      const relativePath = relativePosix(this.repoRoot, filePath);
      const content = readTextFile(filePath);
      const checksum = sha256(content);
      if (this.storage.hasImported("file", relativePath, checksum)) {
        skippedImports += 1;
        continue;
      }

      const blobRef = fileSize(filePath) > INLINE_TEXT_LIMIT ? checksum : null;
      if (blobRef) {
        writeTextAtomic(path.join(this.storage.getBlobsDir(), blobRef), content);
      }

      const event: MemoryEvent = {
        id: randomId("evt"),
        repoId: this.repoConfig.repoId,
        source: "filesystem",
        kind: "file_fact",
        createdAt: nowMs(),
        payloadJson: JSON.stringify({
          path: relativePath,
          excerpt: summarizeText(content, 800),
          content: blobRef ? undefined : content,
          checksum,
        }),
        blobRef,
        tags: detectTextTags(relativePath),
      };

      this.storage.appendEvent(event);
      this.storage.recordImport("file", relativePath, checksum, event.createdAt);
      importedFiles += 1;
    }

    const gitLog = runGit(this.repoRoot, [
      "log",
      "--pretty=format:%H%x1f%ct%x1f%s",
      "-n",
      "20",
    ]);

    if (gitLog.ok && gitLog.stdout) {
      for (const line of gitLog.stdout.split("\n")) {
        const [hash, epoch, subject] = line.split("\u001f");
        if (!hash || !epoch || !subject) {
          continue;
        }

        if (this.storage.hasImported("git", hash, hash)) {
          skippedImports += 1;
          continue;
        }

        const createdAt = Number(epoch) * 1000;
        const event: MemoryEvent = {
          id: randomId("evt"),
          repoId: this.repoConfig.repoId,
          source: "git",
          kind: "git_commit",
          createdAt,
          payloadJson: JSON.stringify({
            hash,
            subject,
          }),
          blobRef: null,
          tags: ["git"],
        };

        this.storage.appendEvent(event);
        this.storage.recordImport("git", hash, hash, createdAt);
        importedCommits += 1;
      }
    }

    this.projection.projectPendingEvents();

    return {
      importedFiles,
      importedCommits,
      skippedImports,
    };
  }
}
