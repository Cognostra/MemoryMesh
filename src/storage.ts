import { Database } from "bun:sqlite";
import path from "node:path";
import type {
  Episode,
  ExportOptions,
  ExportManifest,
  HealthCheckResult,
  MemoryEvent,
  SkillPackDraft,
  SkillStatus,
} from "./types";
import { DB_SCHEMA_VERSION } from "./config";
import { ensureDir, tokenizeSearchQuery } from "./utils";

function parseJsonArray(value: string): string[] {
  return JSON.parse(value) as string[];
}

function parseEvent(row: Record<string, unknown>): MemoryEvent {
  return {
    id: String(row.id),
    repoId: String(row.repo_id),
    source: String(row.source) as MemoryEvent["source"],
    kind: String(row.kind) as MemoryEvent["kind"],
    createdAt: Number(row.created_at),
    sessionId: row.session_id ? String(row.session_id) : null,
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : null,
    payloadJson: String(row.payload_json),
    blobRef: row.blob_ref ? String(row.blob_ref) : null,
    tags: parseJsonArray(String(row.tags_json)),
    projectedAt: row.projected_at ? Number(row.projected_at) : null,
  };
}

function parseEpisode(row: Record<string, unknown>): Episode {
  return {
    id: String(row.id),
    repoId: String(row.repo_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    title: String(row.title),
    summary: String(row.summary),
    decisions: parseJsonArray(String(row.decisions_json)),
    resolutions: parseJsonArray(String(row.resolutions_json)),
    tags: parseJsonArray(String(row.tags_json)),
    citationEventIds: parseJsonArray(String(row.citation_event_ids_json)),
    citationPaths: parseJsonArray(String(row.citation_paths_json)),
    confidence: Number(row.confidence),
    tokenEstimate: Number(row.token_estimate),
  };
}

function parseSkill(row: Record<string, unknown>): SkillPackDraft {
  return {
    id: String(row.id),
    repoId: String(row.repo_id),
    createdAt: Number(row.created_at),
    name: String(row.name),
    description: String(row.description),
    triggers: parseJsonArray(String(row.triggers_json)),
    prerequisites: parseJsonArray(String(row.prerequisites_json)),
    stepsMarkdown: String(row.steps_markdown),
    validationMarkdown: String(row.validation_markdown),
    evidenceEpisodeIds: parseJsonArray(String(row.evidence_episode_ids_json)),
    status: String(row.status) as SkillPackDraft["status"],
  };
}

export class StorageEngine {
  private readonly db: Database;
  private readonly repoId: string;
  private readonly blobsDir: string;
  private readonly readOnly: boolean;

  constructor(dbPath: string, repoId: string, blobsDir: string, readOnly = false) {
    ensureDir(path.dirname(dbPath));
    ensureDir(blobsDir);
    this.db = new Database(dbPath, { readonly: readOnly, create: !readOnly });
    this.repoId = repoId;
    this.blobsDir = blobsDir;
    this.readOnly = readOnly;
  }

  initialize(): void {
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    if (this.readOnly) {
      return;
    }

    this.db.exec("PRAGMA journal_mode = WAL;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        source TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        session_id TEXT,
        dedupe_key TEXT,
        payload_json TEXT NOT NULL,
        blob_ref TEXT,
        tags_json TEXT NOT NULL,
        projected_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        decisions_json TEXT NOT NULL,
        resolutions_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        citation_event_ids_json TEXT NOT NULL,
        citation_paths_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        token_estimate INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
        episode_id UNINDEXED,
        title,
        summary,
        citations
      );

      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        triggers_json TEXT NOT NULL,
        prerequisites_json TEXT NOT NULL,
        steps_markdown TEXT NOT NULL,
        validation_markdown TEXT NOT NULL,
        evidence_episode_ids_json TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        checkpoint_json TEXT,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS imports (
        source_kind TEXT NOT NULL,
        source_ref TEXT NOT NULL,
        checksum TEXT NOT NULL,
        imported_at INTEGER NOT NULL,
        PRIMARY KEY (source_kind, source_ref, checksum)
      );
    `);

    this.db
      .query("INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)")
      .run("schema_version", String(DB_SCHEMA_VERSION));
  }

  close(): void {
    this.db.close(false);
  }

  appendEvent(event: MemoryEvent): void {
    this.db
      .query(`
        INSERT INTO events (
          id, repo_id, source, kind, created_at, session_id, dedupe_key,
          payload_json, blob_ref, tags_json, projected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.id,
        event.repoId,
        event.source,
        event.kind,
        event.createdAt,
        event.sessionId ?? null,
        event.dedupeKey ?? null,
        event.payloadJson,
        event.blobRef ?? null,
        JSON.stringify(event.tags),
        event.projectedAt ?? null,
      );
  }

  listEvents(): MemoryEvent[] {
    const rows = this.db
      .query("SELECT * FROM events WHERE repo_id = ? ORDER BY created_at ASC")
      .all(this.repoId) as Record<string, unknown>[];
    return rows.map(parseEvent);
  }

  listUnprojectedEvents(limit = 1000): MemoryEvent[] {
    const rows = this.db
      .query(`
        SELECT * FROM events
        WHERE repo_id = ? AND projected_at IS NULL
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .all(this.repoId, limit) as Record<string, unknown>[];
    return rows.map(parseEvent);
  }

  markEventProjected(eventId: string, projectedAt: number): void {
    this.db
      .query("UPDATE events SET projected_at = ? WHERE id = ?")
      .run(projectedAt, eventId);
  }

  upsertEpisode(episode: Episode): void {
    const tx = this.db.transaction(() => {
      this.db
        .query(`
          INSERT OR REPLACE INTO episodes (
            id, repo_id, created_at, updated_at, title, summary, decisions_json,
            resolutions_json, tags_json, citation_event_ids_json, citation_paths_json,
            confidence, token_estimate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          episode.id,
          episode.repoId,
          episode.createdAt,
          episode.updatedAt,
          episode.title,
          episode.summary,
          JSON.stringify(episode.decisions),
          JSON.stringify(episode.resolutions),
          JSON.stringify(episode.tags),
          JSON.stringify(episode.citationEventIds),
          JSON.stringify(episode.citationPaths),
          episode.confidence,
          episode.tokenEstimate,
        );

      this.db.query("DELETE FROM episodes_fts WHERE episode_id = ?").run(episode.id);
      this.db
        .query(`
          INSERT INTO episodes_fts (episode_id, title, summary, citations)
          VALUES (?, ?, ?, ?)
        `)
        .run(
          episode.id,
          episode.title,
          episode.summary,
          episode.citationPaths.join(" "),
        );
    });

    tx();
  }

  getEpisode(episodeId: string): Episode | null {
    const row = this.db
      .query("SELECT * FROM episodes WHERE id = ? AND repo_id = ?")
      .get(episodeId, this.repoId) as Record<string, unknown> | null;
    return row ? parseEpisode(row) : null;
  }

  listEpisodes(): Episode[] {
    const rows = this.db
      .query("SELECT * FROM episodes WHERE repo_id = ? ORDER BY created_at DESC")
      .all(this.repoId) as Record<string, unknown>[];
    return rows.map(parseEpisode);
  }

  listRecentEpisodes(limit = 10): Episode[] {
    const rows = this.db
      .query(`
        SELECT * FROM episodes
        WHERE repo_id = ?
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(this.repoId, limit) as Record<string, unknown>[];
    return rows.map(parseEpisode);
  }

  searchEpisodes(queryText: string, limit = 5): Array<{ episode: Episode; score: number; reasons?: string[] }> {
    const trimmed = queryText.trim();
    if (!trimmed) {
      return this.listRecentEpisodes(limit).map((episode, index) => ({
        episode,
        score: limit - index,
        reasons: ["recent"],
      }));
    }

    const tokens = tokenizeSearchQuery(queryText);
    const ftsQuery = tokens.map((token) => `${token}*`).join(" OR ");

    if (ftsQuery) {
      try {
        const rows = this.db
          .query(`
            SELECT e.*, bm25(episodes_fts) AS score
            FROM episodes_fts
            JOIN episodes e ON e.id = episodes_fts.episode_id
            WHERE episodes_fts MATCH ?
            ORDER BY score ASC
            LIMIT ?
          `)
          .all(ftsQuery, limit) as Record<string, unknown>[];

        if (rows.length > 0) {
          return rows.map((row) => ({
            episode: parseEpisode(row),
            score: -Number(row.score),
            reasons: ["fts-match"],
          }));
        }
      } catch {
        // Fall back to JS ranking below.
      }
    }

    const ranked = this.listEpisodes()
      .map((episode) => {
        const reasons: string[] = [];
        const haystack = [
          episode.title,
          episode.summary,
          episode.citationPaths.join(" "),
          episode.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        const score = tokens.reduce((total, token) => {
          if (!haystack.includes(token)) {
            return total;
          }

          let tokenScore = 1;
          if (episode.title.toLowerCase().includes(token)) {
            tokenScore += 2;
            reasons.push(`title:${token}`);
          }
          if (episode.tags.some((tag) => tag.toLowerCase().includes(token))) {
            tokenScore += 1;
            reasons.push(`tag:${token}`);
          }
          if (episode.citationPaths.some((citation) => citation.toLowerCase().includes(token))) {
            tokenScore += 2;
            reasons.push(`path:${token}`);
          }
          if (episode.summary.toLowerCase().includes(token)) {
            reasons.push(`summary:${token}`);
          }

          return total + tokenScore;
        }, 0);

        if (episode.tags.includes("agent-instructions")) {
          reasons.push("instruction-surface");
        }
        if (episode.tags.includes("docs")) {
          reasons.push("docs");
        }

        return { episode, score, reasons };
      })
      .filter((row) => row.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return right.episode.updatedAt - left.episode.updatedAt;
      })
      .slice(0, limit);

    if (ranked.length > 0) {
      return ranked;
    }

    const like = `%${trimmed}%`;
    const rows = this.db
      .query(`
        SELECT *
        FROM episodes
        WHERE repo_id = ?
          AND (title LIKE ? OR summary LIKE ?)
        ORDER BY updated_at DESC
        LIMIT ?
      `)
      .all(this.repoId, like, like, limit) as Record<string, unknown>[];

    if (rows.length > 0) {
      return rows.map((row, index) => ({
        episode: parseEpisode(row),
        score: index,
        reasons: ["like-match"],
      }));
    }

    return this.listRecentEpisodes(limit).map((episode, index) => ({
      episode,
      score: limit - index,
      reasons: ["recent-fallback"],
    }));
  }

  upsertSkill(skill: SkillPackDraft): void {
    this.db
      .query(`
        INSERT OR REPLACE INTO skills (
          id, repo_id, created_at, name, description, triggers_json,
          prerequisites_json, steps_markdown, validation_markdown,
          evidence_episode_ids_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        skill.id,
        skill.repoId,
        skill.createdAt,
        skill.name,
        skill.description,
        JSON.stringify(skill.triggers),
        JSON.stringify(skill.prerequisites),
        skill.stepsMarkdown,
        skill.validationMarkdown,
        JSON.stringify(skill.evidenceEpisodeIds),
        skill.status,
      );
  }

  listSkills(): SkillPackDraft[] {
    const rows = this.db
      .query("SELECT * FROM skills WHERE repo_id = ? ORDER BY created_at DESC")
      .all(this.repoId) as Record<string, unknown>[];
    return rows.map(parseSkill);
  }

  getSkill(skillId: string): SkillPackDraft | null {
    const row = this.db
      .query("SELECT * FROM skills WHERE id = ? AND repo_id = ?")
      .get(skillId, this.repoId) as Record<string, unknown> | null;
    return row ? parseSkill(row) : null;
  }

  updateSkillStatus(skillId: string, status: SkillStatus): SkillPackDraft | null {
    this.db
      .query("UPDATE skills SET status = ? WHERE id = ? AND repo_id = ?")
      .run(status, skillId, this.repoId);
    return this.getSkill(skillId);
  }

  listSkillsByStatus(status: SkillStatus): SkillPackDraft[] {
    const rows = this.db
      .query(`
        SELECT * FROM skills
        WHERE repo_id = ? AND status = ?
        ORDER BY created_at DESC
      `)
      .all(this.repoId, status) as Record<string, unknown>[];
    return rows.map(parseSkill);
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .query("INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)")
      .run(key, JSON.stringify(value));
  }

  getSetting<T>(key: string): T | null {
    const row = this.db
      .query("SELECT value_json FROM settings WHERE key = ?")
      .get(key) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    return JSON.parse(String(row.value_json)) as T;
  }

  hasImported(sourceKind: string, sourceRef: string, checksum: string): boolean {
    const row = this.db
      .query(`
        SELECT 1
        FROM imports
        WHERE source_kind = ? AND source_ref = ? AND checksum = ?
      `)
      .get(sourceKind, sourceRef, checksum) as Record<string, unknown> | null;

    return row !== null;
  }

  recordImport(sourceKind: string, sourceRef: string, checksum: string, importedAt: number): void {
    this.db
      .query(`
        INSERT OR IGNORE INTO imports (source_kind, source_ref, checksum, imported_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(sourceKind, sourceRef, checksum, importedAt);
  }

  getCounts(): HealthCheckResult["counts"] {
    const eventsRow = this.db.query("SELECT COUNT(*) AS count FROM events").get() as Record<string, unknown>;
    const episodesRow = this.db.query("SELECT COUNT(*) AS count FROM episodes").get() as Record<string, unknown>;
    const skillsRow = this.db.query("SELECT COUNT(*) AS count FROM skills").get() as Record<string, unknown>;

    return {
      events: Number(eventsRow.count),
      episodes: Number(episodesRow.count),
      skills: Number(skillsRow.count),
    };
  }

  getIntegrityStatus(): string {
    const row = this.db.query("PRAGMA quick_check").get() as Record<string, unknown>;
    const value = Object.values(row)[0];
    return String(value);
  }

  getBlobRefs(): string[] {
    const rows = this.db
      .query("SELECT blob_ref FROM events WHERE blob_ref IS NOT NULL")
      .all() as Record<string, unknown>[];
    return rows.map((row) => String(row.blob_ref));
  }

  getExportManifest(repoRoot: string, options?: ExportOptions): ExportManifest {
    return {
      version: DB_SCHEMA_VERSION,
      exportedAt: Date.now(),
      sourceRepoId: this.repoId,
      sourceRepoRoot: repoRoot,
      redactionPreset: options?.redactionPreset ?? "none",
      counts: this.getCounts(),
    };
  }

  getRepoId(): string {
    return this.repoId;
  }

  getBlobsDir(): string {
    return this.blobsDir;
  }
}
