#!/usr/bin/env bun
import path from "node:path";
import { MemoryMeshApp } from "./app";
import { runEval } from "./eval";
import { MemoryMeshMcpServer } from "./mcp";
import type { ExportOptions, RedactionPreset } from "./types";

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage(): void {
  process.stdout.write(
    [
      "memorymesh init [path]",
      "memorymesh serve [path]",
      "memorymesh status",
      "memorymesh mcp-config",
      "memorymesh overview",
      "memorymesh recent",
      "memorymesh eval <queries.json> [repoPath]",
      "memorymesh query <text>",
      "memorymesh note <content>",
      "memorymesh bootstrap",
      "memorymesh export <path> [--redact[=safe|strict]]",
      "memorymesh export profile <claude|codex|cursor> <path> [--redact[=safe|strict]]",
      "memorymesh export skill <skillId> [path] [--redact[=safe|strict]]",
      "memorymesh import <path>",
      "memorymesh import transcript <file.jsonl>",
      "memorymesh doctor",
      "memorymesh skills review",
      "memorymesh skills propose [name]",
      "memorymesh skills approve <skillId>",
      "memorymesh skills reject <skillId>",
    ].join("\n") + "\n",
  );
}

function parseExportOptions(args: string[]): { positional: string[]; exportOptions: ExportOptions } {
  let redactionPreset: RedactionPreset = "none";
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--redact") {
      redactionPreset = "safe";
      continue;
    }

    if (arg === "--no-redact") {
      redactionPreset = "none";
      continue;
    }

    if (arg.startsWith("--redact=")) {
      const preset = arg.slice("--redact=".length) as RedactionPreset;
      if (!["none", "safe", "strict"].includes(preset)) {
        throw new Error("Redaction preset must be one of: none, safe, strict");
      }
      redactionPreset = preset;
      continue;
    }

    positional.push(arg);
  }

  return {
    positional,
    exportOptions: {
      redactionPreset,
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command, ...rest] = args;

  if (!command || command === "--help" || command === "help") {
    printUsage();
    return;
  }

  if (command === "init") {
    const targetPath = rest[0] ? path.resolve(rest[0]) : process.cwd();
    const { app, bootstrapReport } = MemoryMeshApp.init(targetPath);
    const commandPath = path.resolve(import.meta.dir, "..", "bin", "memorymesh");
    process.stdout.write(`Initialized MemoryMesh in ${app.repoRoot}\n`);
    printJson({
      repoId: app.repoConfig.repoId,
      bootstrapReport,
      suggestedPaths: app.getSuggestedPaths(),
      mcpConfig: app.getMcpConfigSnippet(commandPath),
    });
    app.close();
    return;
  }

  if (command === "serve") {
    const targetPath = rest[0] ? path.resolve(rest[0]) : process.cwd();
    const app = MemoryMeshApp.open(targetPath, false);
    const server = new MemoryMeshMcpServer(app);
    await server.serveStdio();
    return;
  }

  if (command === "eval") {
    const queriesPath = rest[0];
    const repoPath = rest[1] ? path.resolve(rest[1]) : process.cwd();
    if (!queriesPath) {
      throw new Error("Usage: memorymesh eval <queries.json> [repoPath]");
    }
    printJson(runEval(queriesPath, repoPath));
    return;
  }

  const readOnlyCommands = new Set(["status", "mcp-config", "overview", "recent", "query", "doctor"]);
  const readOnly = readOnlyCommands.has(command) || (command === "skills" && rest[0] === "review");
  const app = MemoryMeshApp.open(process.cwd(), readOnly);

  try {
    switch (command) {
      case "status":
        printJson(app.status());
        break;
      case "mcp-config": {
        const commandPath = path.resolve(import.meta.dir, "..", "bin", "memorymesh");
        process.stdout.write(`${app.getMcpConfigSnippet(commandPath)}\n`);
        break;
      }
      case "overview":
        process.stdout.write(`${app.getOverview()}\n`);
        break;
      case "recent":
        printJson(app.getRecentEpisodes(5));
        break;
      case "query": {
        const text = rest.join(" ").trim();
        if (!text) {
          throw new Error("Usage: memorymesh query <text>");
        }
        const result = app.query(text);
        process.stdout.write(`Answer:\n${result.answer}\n\nCitations:\n`);
        process.stdout.write(`${result.citations.map((citation) => `- ${citation}`).join("\n") || "- none"}\n`);
        break;
      }
      case "note": {
        const content = rest.join(" ").trim();
        if (!content) {
          throw new Error("Usage: memorymesh note <content>");
        }
        app.note(content);
        process.stdout.write("Stored note.\n");
        break;
      }
      case "bootstrap": {
        printJson(app.bootstrap());
        break;
      }
      case "export": {
        const { positional, exportOptions } = parseExportOptions(rest);
        const maybeSubcommand = positional[0];
        if (!maybeSubcommand) {
          throw new Error("Usage: memorymesh export <path> [--redact[=safe|strict]] | memorymesh export profile <kind> <path> [--redact[=safe|strict]] | memorymesh export skill <skillId> [path] [--redact[=safe|strict]]");
        }
        if (maybeSubcommand === "profile") {
          const kind = positional[1] as "claude" | "codex" | "cursor" | undefined;
          const outputPath = positional[2];
          if (!kind || !outputPath || !["claude", "codex", "cursor"].includes(kind)) {
            throw new Error("Usage: memorymesh export profile <claude|codex|cursor> <path> [--redact[=safe|strict]]");
          }
          printJson({
            kind,
            redactionPreset: exportOptions.redactionPreset ?? "none",
            files: app.exportProfile(kind, outputPath, exportOptions),
          });
          break;
        }
        if (maybeSubcommand === "skill") {
          const skillId = positional[1];
          const outputPath = positional[2];
          if (!skillId) {
            throw new Error("Usage: memorymesh export skill <skillId> [path] [--redact[=safe|strict]]");
          }
          process.stdout.write(`${app.exportSkillPack(skillId, outputPath, exportOptions)}\n`);
          break;
        }
        process.stdout.write(`${app.exportBundle(maybeSubcommand, exportOptions)}\n`);
        break;
      }
      case "import": {
        const maybeSubcommand = rest[0];
        if (!maybeSubcommand) {
          throw new Error("Usage: memorymesh import <path> | memorymesh import transcript <file.jsonl>");
        }
        if (maybeSubcommand === "transcript") {
          const inputPath = rest[1];
          if (!inputPath) {
            throw new Error("Usage: memorymesh import transcript <file.jsonl>");
          }
          printJson(app.importTranscript(inputPath));
          break;
        }
        app.importBundle(maybeSubcommand);
        process.stdout.write("Imported bundle.\n");
        break;
      }
      case "doctor":
        printJson(app.doctor());
        break;
      case "skills": {
        const subcommand = rest[0];
        if (subcommand === "review") {
          printJson(app.listSkills());
          break;
        }
        if (subcommand === "propose") {
          const skill = app.proposeSkill(rest.slice(1).join(" ").trim() || undefined);
          if (!skill) {
            process.stdout.write("Not enough evidence to propose a skill yet.\n");
          } else {
            printJson(skill);
          }
          break;
        }
        if (subcommand === "approve") {
          const skillId = rest[1];
          if (!skillId) {
            throw new Error("Usage: memorymesh skills approve <skillId>");
          }
          const skill = app.updateSkillStatus(skillId, "approved");
          if (!skill) {
            throw new Error(`Unknown skill: ${skillId}`);
          }
          printJson(skill);
          break;
        }
        if (subcommand === "reject") {
          const skillId = rest[1];
          if (!skillId) {
            throw new Error("Usage: memorymesh skills reject <skillId>");
          }
          const skill = app.updateSkillStatus(skillId, "rejected");
          if (!skill) {
            throw new Error(`Unknown skill: ${skillId}`);
          }
          printJson(skill);
          break;
        }
        throw new Error("Usage: memorymesh skills review | memorymesh skills propose [name] | memorymesh skills approve <skillId> | memorymesh skills reject <skillId>");
      }
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
