import type { Episode, MemoryEvent, SkillPackDraft } from "./types";
import { StorageEngine } from "./storage";
import { estimateTokens, nowMs, randomId, summarizeText } from "./utils";

function parsePayload(event: MemoryEvent): Record<string, unknown> {
  return JSON.parse(event.payloadJson) as Record<string, unknown>;
}

export class ProjectionWorker {
  constructor(private readonly storage: StorageEngine) {}

  projectPendingEvents(): number {
    const events = this.storage.listUnprojectedEvents();
    let projected = 0;

    for (const event of events) {
      const episode = this.buildEpisodeFromEvent(event);
      if (episode) {
        this.storage.upsertEpisode(episode);
      }
      this.storage.markEventProjected(event.id, nowMs());
      projected += 1;
    }

    this.refreshOverview();
    return projected;
  }

  buildEpisodeFromEvent(event: MemoryEvent): Episode | null {
    const payload = parsePayload(event);
    const createdAt = event.createdAt;

    if (event.kind === "file_fact") {
      const relativePath = String(payload.path ?? "unknown");
      const summary = summarizeText(String(payload.excerpt ?? payload.content ?? ""));
      return {
        id: randomId("ep"),
        repoId: event.repoId,
        createdAt,
        updatedAt: createdAt,
        title: `Imported ${relativePath}`,
        summary,
        decisions: [],
        resolutions: [],
        tags: event.tags,
        citationEventIds: [event.id],
        citationPaths: [relativePath],
        confidence: 1,
        tokenEstimate: estimateTokens(summary),
      };
    }

    if (event.kind === "git_commit") {
      const hash = String(payload.hash ?? "unknown");
      const subject = String(payload.subject ?? "Git commit");
      const summary = `Recent commit ${hash.slice(0, 7)}: ${subject}`;
      return {
        id: randomId("ep"),
        repoId: event.repoId,
        createdAt,
        updatedAt: createdAt,
        title: `Commit ${hash.slice(0, 7)}`,
        summary,
        decisions: [],
        resolutions: [],
        tags: ["git", ...event.tags],
        citationEventIds: [event.id],
        citationPaths: [`git:${hash.slice(0, 7)}`],
        confidence: 1,
        tokenEstimate: estimateTokens(summary),
      };
    }

    if (event.kind === "note" || event.kind === "decision" || event.kind === "error_resolution") {
      const content = String(payload.content ?? "");
      const titlePrefix =
        event.kind === "decision" ? "Decision" : event.kind === "error_resolution" ? "Resolution" : "Note";
      const summary = summarizeText(content, 420);
      return {
        id: randomId("ep"),
        repoId: event.repoId,
        createdAt,
        updatedAt: createdAt,
        title: `${titlePrefix}: ${summary.slice(0, 64)}`,
        summary,
        decisions: event.kind === "decision" ? [summary] : [],
        resolutions: event.kind === "error_resolution" ? [summary] : [],
        tags: event.tags,
        citationEventIds: [event.id],
        citationPaths: ["memorymesh://notes"],
        confidence: 1,
        tokenEstimate: estimateTokens(summary),
      };
    }

    if (event.kind === "tool_call" || event.kind === "tool_result") {
      if (event.kind === "tool_call") {
        return null;
      }

      return this.buildMcpEpisode(event, payload, createdAt);
    }

    return null;
  }

  refreshOverview(): string {
    const episodes = this.storage.listRecentEpisodes(8);
    const instructions = episodes.filter((episode) =>
      episode.tags.some((tag) => ["agent-instructions", "claude", "cursor", "readme", "docs"].includes(tag)),
    );
    const recent = episodes.slice(0, 3);

    const lines: string[] = [];
    if (instructions.length > 0) {
      lines.push("Project guidance:");
      for (const episode of instructions.slice(0, 3)) {
        lines.push(`- ${episode.title}: ${episode.summary}`);
      }
    }

    if (recent.length > 0) {
      lines.push("Recent context:");
      for (const episode of recent) {
        lines.push(`- ${episode.title}: ${episode.summary}`);
      }
    }

    const overview = lines.join("\n").trim() || "No overview available yet.";
    this.storage.setSetting("overview", overview);
    return overview;
  }

  proposeSkill(name?: string): SkillPackDraft | null {
    const episodes = this.storage
      .listRecentEpisodes(10)
      .filter((episode) => !episode.title.startsWith("Imported "))
      .slice(0, 5);

    if (episodes.length < 3) {
      return null;
    }

    const draft: SkillPackDraft = {
      id: randomId("skill"),
      repoId: this.storage.getRepoId(),
      createdAt: nowMs(),
      name: name ?? "recent-workflow",
      description: "Draft skill synthesized from recent repeated project work.",
      triggers: ["When recent work in this repo resembles the cited episodes."],
      prerequisites: ["Review before activation"],
      stepsMarkdown: episodes
        .map((episode, index) => `${index + 1}. Review: ${episode.title}\n   - ${episode.summary}`)
        .join("\n"),
      validationMarkdown: "- Confirm cited files still exist\n- Confirm the workflow still applies\n- Run repository tests if available",
      evidenceEpisodeIds: episodes.map((episode) => episode.id),
      status: "draft",
    };

    this.storage.upsertSkill(draft);
    return draft;
  }

  private buildMcpEpisode(
    event: MemoryEvent,
    payload: Record<string, unknown>,
    createdAt: number,
  ): Episode {
    const label = String(payload.name ?? payload.uri ?? payload.method ?? "interaction");
    const itemSummary = summarizeText(String(payload.summary ?? payload.content ?? JSON.stringify(payload)), 220);
    const sessionId = event.sessionId?.trim();

    if (!sessionId) {
      return {
        id: randomId("ep"),
        repoId: event.repoId,
        createdAt,
        updatedAt: createdAt,
        title: `MCP ${label}`,
        summary: itemSummary,
        decisions: [],
        resolutions: [],
        tags: event.tags,
        citationEventIds: [event.id],
        citationPaths: ["memorymesh://recent"],
        confidence: 0.9,
        tokenEstimate: estimateTokens(itemSummary),
      };
    }

    const episodeId = `ep_session_${sessionId}`;
    const existing = this.storage.getEpisode(episodeId);
    const baseLines = existing
      ? existing.summary
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
    const nextLine = `- ${label}: ${itemSummary}`;
    const recentLines = [...baseLines, nextLine].slice(-5);
    const extraCitations = Array.isArray(payload.citations)
      ? (payload.citations.filter((value): value is string => typeof value === "string"))
      : [];
    const citationPaths = [...new Set([...(existing?.citationPaths ?? []), "memorymesh://recent", ...extraCitations])];
    const citationEventIds = [...new Set([...(existing?.citationEventIds ?? []), event.id])];
    const tags = [...new Set([...(existing?.tags ?? []), ...event.tags, label])];
    const summary = recentLines.join("\n");

    return {
      id: episodeId,
      repoId: event.repoId,
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt,
      title: `MCP session ${sessionId.slice(-8)}`,
      summary,
      decisions: existing?.decisions ?? [],
      resolutions: existing?.resolutions ?? [],
      tags,
      citationEventIds,
      citationPaths,
      confidence: 0.92,
      tokenEstimate: estimateTokens(summary),
    };
  }
}
