import path from "node:path";

export const MEMORYMESH_DIR = ".memorymesh";
export const DB_FILENAME = "metadata.db";
export const BLOBS_DIRNAME = "blobs";
export const EXPORTS_DIRNAME = "exports";
export const LOGS_DIRNAME = "logs";
export const REPO_CONFIG_FILENAME = "repo.json";
export const APP_VERSION = "0.1.0";
export const DB_SCHEMA_VERSION = 1;

export interface RepoPaths {
  repoRoot: string;
  memoryDir: string;
  dbPath: string;
  blobsDir: string;
  exportsDir: string;
  logsDir: string;
  repoConfigPath: string;
}

export function getRepoPaths(repoRoot: string): RepoPaths {
  const memoryDir = path.join(repoRoot, MEMORYMESH_DIR);

  return {
    repoRoot,
    memoryDir,
    dbPath: path.join(memoryDir, DB_FILENAME),
    blobsDir: path.join(memoryDir, BLOBS_DIRNAME),
    exportsDir: path.join(memoryDir, EXPORTS_DIRNAME),
    logsDir: path.join(memoryDir, LOGS_DIRNAME),
    repoConfigPath: path.join(memoryDir, REPO_CONFIG_FILENAME),
  };
}
