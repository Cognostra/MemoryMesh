import type { QueryResult } from "./types";
import { StorageEngine } from "./storage";
import { tokenizeSearchQuery } from "./utils";

export class RetrievalEngine {
  constructor(private readonly storage: StorageEngine) {}

  query(text: string, limit = 5): QueryResult {
    const hits = this.reRank(text, this.storage.searchEpisodes(text, limit));

    if (hits.length === 0) {
      return {
        answer: "No matching memory found yet. Run `memorymesh bootstrap` or add a note.",
        citations: [],
        hits: [],
      };
    }

    const top = hits.slice(0, 3);
    const answerLines = top.map((hit) => {
      const primaryCitation = hit.episode.citationPaths[0] ?? "memorymesh://recent";
      return `- ${hit.episode.title}: ${hit.episode.summary} [${primaryCitation}]`;
    });
    const citations = [...new Set(top.flatMap((hit) => hit.episode.citationPaths))].slice(0, 8);

    return {
      answer: answerLines.join("\n"),
      citations,
      hits,
    };
  }

  private reRank(
    text: string,
    hits: ReturnType<StorageEngine["searchEpisodes"]>,
  ): QueryResult["hits"] {
    const lowered = text.toLowerCase();
    const tokens = tokenizeSearchQuery(text);

    return hits
      .map((hit) => {
        let adjusted = hit.score;
        const reasons = [...(hit.reasons ?? [])];

        if (this.isInstructionQuery(lowered)) {
          if (hit.episode.tags.some((tag) => ["agent-instructions", "claude", "cursor", "readme"].includes(tag))) {
            adjusted += 5;
            reasons.push("instruction-query-boost");
          }
        }

        if (this.isPromiseQuery(lowered)) {
          if (
            hit.episode.tags.includes("readme") ||
            hit.episode.citationPaths.some((citation) => citation.toLowerCase().includes("readme"))
          ) {
            adjusted += 6;
            reasons.push("readme-query-boost");
          }
        }

        if (this.isArchitectureQuery(lowered)) {
          if (
            hit.episode.tags.includes("docs") ||
            hit.episode.citationPaths.some((citation) => citation.toLowerCase().includes("architecture"))
          ) {
            adjusted += 4;
            reasons.push("architecture-query-boost");
          }
        }

        if (this.isSetupQuery(lowered)) {
          if (
            hit.episode.citationPaths.some((citation) => citation.toLowerCase().includes("quickstart")) ||
            hit.episode.summary.toLowerCase().includes("mcp config")
          ) {
            adjusted += 6;
            reasons.push("setup-query-boost");
          }
        }

        if (this.isRecoveryQuery(lowered)) {
          if (
            /(fix|fixed|resolve|resolved|resolution|incident|bug)/.test(hit.episode.summary.toLowerCase()) ||
            hit.episode.citationPaths.some((citation) =>
              citation.startsWith("memorymesh://imports") || citation.startsWith("memorymesh://notes"),
            ) ||
            hit.episode.tags.some((tag) => ["transcript", "manual", "fix", "error_resolution"].includes(tag))
          ) {
            adjusted += 7;
            reasons.push("recovery-query-boost");
          }
        }

        if (tokens.some((token) => hit.episode.citationPaths.some((citation) => citation.toLowerCase().includes(token)))) {
          adjusted += 2;
          reasons.push("citation-path-boost");
        }

        return {
          episode: hit.episode,
          score: adjusted,
          reasons,
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return right.episode.updatedAt - left.episode.updatedAt;
      });
  }

  private isInstructionQuery(query: string): boolean {
    return /(agent|instruction|convention|rule|guide|workflow)/.test(query);
  }

  private isArchitectureQuery(query: string): boolean {
    return /(architecture|storage|design|structure|schema)/.test(query);
  }

  private isPromiseQuery(query: string): boolean {
    return /(promise|value|positioning|why|what does this repo)/.test(query);
  }

  private isSetupQuery(query: string): boolean {
    return /(mcp config|config|setup|quickstart|init|install|serve)/.test(query);
  }

  private isRecoveryQuery(query: string): boolean {
    return /(fix|fixed|resolve|resolved|resolution|error|incident|history|how was)/.test(query);
  }
}
