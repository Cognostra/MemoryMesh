import path from "node:path";
import type { HealthCheckResult } from "./types";
import { StorageEngine } from "./storage";
import { pathExists, readJsonFile } from "./utils";
import type { RepoPaths } from "./config";
import type { RepoConfig } from "./types";

export class Doctor {
  constructor(
    private readonly paths: RepoPaths,
    private readonly storage: StorageEngine,
  ) {}

  run(): HealthCheckResult {
    const checks: HealthCheckResult["checks"] = [];
    const repoConfigExists = pathExists(this.paths.repoConfigPath);
    checks.push({
      name: "repo-config",
      ok: repoConfigExists,
      detail: repoConfigExists ? "repo.json present" : "Missing repo.json",
    });

    if (repoConfigExists) {
      const repoConfig = readJsonFile<RepoConfig>(this.paths.repoConfigPath);
      checks.push({
        name: "repo-root",
        ok: repoConfig.repoRoot.length > 0,
        detail: repoConfig.repoRoot,
      });
    }

    const dbExists = pathExists(this.paths.dbPath);
    checks.push({
      name: "metadata-db",
      ok: dbExists,
      detail: dbExists ? this.paths.dbPath : "Missing metadata.db",
    });

    const integrity = this.storage.getIntegrityStatus();
    checks.push({
      name: "sqlite-quick-check",
      ok: integrity === "ok",
      detail: integrity,
    });

    let missingBlobs = 0;
    for (const blobRef of this.storage.getBlobRefs()) {
      if (!pathExists(path.join(this.paths.blobsDir, blobRef))) {
        missingBlobs += 1;
      }
    }

    checks.push({
      name: "blob-files",
      ok: missingBlobs === 0,
      detail: missingBlobs === 0 ? "All blob refs resolved" : `${missingBlobs} blobs missing`,
    });

    return {
      ok: checks.every((check) => check.ok),
      checks,
      counts: this.storage.getCounts(),
    };
  }
}
