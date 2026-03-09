export type CaptureSource = "mcp" | "git" | "filesystem" | "importer" | "manual";

export type EventKind =
  | "tool_call"
  | "tool_result"
  | "note"
  | "decision"
  | "error_resolution"
  | "file_fact"
  | "git_commit";

export interface RepoFingerprints {
  gitRoot: string | null;
  remotes: string[];
  defaultBranch: string | null;
  initializedAt: number;
}

export interface RepoConfig {
  version: number;
  repoId: string;
  repoRoot: string;
  createdAt: number;
  updatedAt: number;
  fingerprints: RepoFingerprints;
}

export interface MemoryEvent {
  id: string;
  repoId: string;
  source: CaptureSource;
  kind: EventKind;
  createdAt: number;
  sessionId?: string | null;
  dedupeKey?: string | null;
  payloadJson: string;
  blobRef?: string | null;
  tags: string[];
  projectedAt?: number | null;
}

export interface Episode {
  id: string;
  repoId: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  summary: string;
  decisions: string[];
  resolutions: string[];
  tags: string[];
  citationEventIds: string[];
  citationPaths: string[];
  confidence: number;
  tokenEstimate: number;
}

export interface SkillPackDraft {
  id: string;
  repoId: string;
  createdAt: number;
  name: string;
  description: string;
  triggers: string[];
  prerequisites: string[];
  stepsMarkdown: string;
  validationMarkdown: string;
  evidenceEpisodeIds: string[];
  status: "draft" | "approved" | "rejected" | "deprecated";
}

export type SkillStatus = SkillPackDraft["status"];

export type ProfileKind = "claude" | "codex" | "cursor";
export type RedactionPreset = "none" | "safe" | "strict";

export interface ExportOptions {
  redactionPreset?: RedactionPreset;
}

export interface SearchHit {
  episode: Episode;
  score: number;
  reasons?: string[];
}

export interface QueryResult {
  answer: string;
  citations: string[];
  hits: SearchHit[];
}

export interface HealthCheckResult {
  ok: boolean;
  checks: Array<{
    name: string;
    ok: boolean;
    detail: string;
  }>;
  counts: {
    events: number;
    episodes: number;
    skills: number;
  };
}

export interface BootstrapReport {
  importedFiles: number;
  importedCommits: number;
  skippedImports: number;
}

export interface StatusReport {
  repoId: string;
  repoRoot: string;
  overview: string;
  suggestedPaths: string[];
  counts: {
    events: number;
    episodes: number;
    skills: number;
  };
}

export interface ExportManifest {
  version: number;
  exportedAt: number;
  sourceRepoId: string;
  sourceRepoRoot: string;
  redactionPreset: RedactionPreset;
  counts: {
    events: number;
    episodes: number;
    skills: number;
  };
}

export interface TranscriptRow {
  timestamp?: string | number;
  sessionId?: string;
  kind?: string;
  role?: string;
  name?: string;
  content?: string;
  summary?: string;
  tags?: string[];
  sourceRef?: string;
}
