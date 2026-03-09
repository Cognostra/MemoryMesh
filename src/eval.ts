import { readFileSync } from "node:fs";
import path from "node:path";
import type { QueryResult } from "./types";
import { MemoryMeshApp } from "./app";

interface EvalQuery {
  id: string;
  query: string;
  expectsCitation?: string;
}

export interface EvalReport {
  source: string;
  repoRoot: string;
  totalQueries: number;
  matchedExpectedCitationCount: number;
  results: Array<{
    id: string;
    query: string;
    answer: string;
    citations: string[];
    matchedExpectedCitation: boolean;
  }>;
}

function summarizeResult(query: EvalQuery, result: QueryResult) {
  return {
    id: query.id,
    query: query.query,
    answer: result.answer,
    citations: result.citations,
    matchedExpectedCitation: query.expectsCitation
      ? result.citations.includes(query.expectsCitation)
      : result.citations.length > 0,
  };
}

export function runEval(queriesPath: string, repoRoot = process.cwd()): EvalReport {
  const resolvedQueriesPath = path.resolve(queriesPath);
  const queries = JSON.parse(readFileSync(resolvedQueriesPath, "utf8")) as EvalQuery[];
  const app = MemoryMeshApp.open(repoRoot, true);

  try {
    const results = queries.map((query) => summarizeResult(query, app.query(query.query)));
    return {
      source: resolvedQueriesPath,
      repoRoot: app.repoRoot,
      totalQueries: results.length,
      matchedExpectedCitationCount: results.filter((result) => result.matchedExpectedCitation).length,
      results,
    };
  } finally {
    app.close();
  }
}
