import type { QueryResult } from "./types";
import { MemoryMeshApp } from "./app";
import { randomId, summarizeText } from "./utils";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export class MemoryMeshMcpServer {
  private readonly sessionId = randomId("mcp");

  constructor(private readonly app: MemoryMeshApp) {}

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    switch (request.method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: "memorymesh",
              version: this.app.getVersion(),
            },
          },
        };
      case "notifications/initialized":
        return null;
      case "ping":
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {},
        };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            tools: [
              {
                name: "memorymesh_search",
                description: "Search MemoryMesh for cited project context.",
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    limit: { type: "number" },
                  },
                  required: ["query"],
                },
              },
              {
                name: "memorymesh_note",
                description: "Store a high-signal manual note.",
                inputSchema: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    kind: {
                      type: "string",
                      enum: ["note", "decision", "error_resolution"],
                    },
                  },
                  required: ["content"],
                },
              },
              {
                name: "memorymesh_refresh",
                description: "Re-run importers and projections.",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "memorymesh_propose_skill",
                description: "Create a reviewed skill draft from recent work.",
                inputSchema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                  },
                },
              },
            ],
          },
        };
      case "resources/list":
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            resources: [
              {
                uri: "memorymesh://overview",
                name: "Project Overview",
                mimeType: "text/plain",
              },
              {
                uri: "memorymesh://recent",
                name: "Recent Episodes",
                mimeType: "application/json",
              },
              {
                uri: "memorymesh://skills",
                name: "Skill Drafts",
                mimeType: "application/json",
              },
              {
                uri: "memorymesh://health",
                name: "Health",
                mimeType: "application/json",
              },
            ],
          },
        };
      case "resources/read":
        this.captureInteractionCall("resources/read", request.params ?? {});
        const resource = this.readResource(String(request.params?.uri ?? ""));
        this.captureInteractionResult(
          "resources/read",
          {
            uri: resource.uri,
            summary: summarizeText(resource.text, 320),
          },
          ["resource"],
        );
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            contents: [resource],
          },
        };
      case "tools/call":
        this.captureInteractionCall(String(request.params?.name ?? ""), request.params ?? {});
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: await this.callTool(String(request.params?.name ?? ""), request.params ?? {}),
        };
      default:
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          error: {
            code: -32601,
            message: `Unsupported method: ${request.method}`,
          },
        };
    }
  }

  async serveStdio(): Promise<void> {
    let buffer = Buffer.alloc(0);

    process.stdin.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      this.flushBuffer(() => buffer, (next) => {
        buffer = next;
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.writeMessage({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32000,
            message,
          },
        });
      });
    });

    process.stdin.resume();
  }

  private async flushBuffer(
    getBuffer: () => Buffer,
    setBuffer: (buffer: Buffer) => void,
  ): Promise<void> {
    while (true) {
      const current = getBuffer();
      const headerEnd = current.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const headerText = current.slice(0, headerEnd).toString("utf8");
      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!match) {
        setBuffer(Buffer.alloc(0));
        return;
      }

      const contentLength = Number(match[1]);
      const totalLength = headerEnd + 4 + contentLength;
      if (current.length < totalLength) {
        return;
      }

      const body = current.slice(headerEnd + 4, totalLength).toString("utf8");
      setBuffer(current.slice(totalLength));

      const request = JSON.parse(body) as JsonRpcRequest;
      const response = await this.handleRequest(request);
      if (response) {
        this.writeMessage(response);
      }
    }
  }

  private writeMessage(payload: JsonRpcResponse): void {
    const body = JSON.stringify(payload);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  private readResource(uri: string): { uri: string; mimeType: string; text: string } {
    switch (uri) {
      case "memorymesh://overview":
        return {
          uri,
          mimeType: "text/plain",
          text: this.app.getOverview(),
        };
      case "memorymesh://recent":
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(this.app.getRecentEpisodes(5), null, 2),
        };
      case "memorymesh://skills":
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(this.app.listSkills(), null, 2),
        };
      case "memorymesh://health":
        return {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(this.app.doctor(), null, 2),
        };
      default:
        return {
          uri,
          mimeType: "text/plain",
          text: "Unknown resource",
        };
    }
  }

  private async callTool(name: string, params: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (name === "memorymesh_search") {
      const query = String(params.arguments ? (params.arguments as Record<string, unknown>).query : params.query ?? "");
      const limitValue =
        params.arguments && typeof (params.arguments as Record<string, unknown>).limit === "number"
          ? Number((params.arguments as Record<string, unknown>).limit)
          : typeof params.limit === "number"
            ? Number(params.limit)
            : 5;
      const result = this.app.query(query, limitValue);
      this.captureInteractionResult(
        name,
        {
          query,
          summary: `Search query "${query}" returned ${result.citations.length} citations.`,
          citations: result.citations,
        },
        ["search"],
      );
      return {
        content: [{ type: "text", text: this.renderQueryResult(result) }],
      };
    }

    if (name === "memorymesh_note") {
      const raw = (params.arguments as Record<string, unknown> | undefined) ?? params;
      const content = String(raw.content ?? "");
      const kind = String(raw.kind ?? "note") as "note" | "decision" | "error_resolution";
      this.app.note(content, kind);
      this.captureInteractionResult(
        name,
        {
          kind,
          summary: `Stored ${kind} note: ${summarizeText(content, 180)}`,
        },
        ["note"],
      );
      return {
        content: [{ type: "text", text: "Note stored in MemoryMesh." }],
      };
    }

    if (name === "memorymesh_refresh") {
      const report = this.app.bootstrap();
      this.captureInteractionResult(
        name,
        {
          summary: `Refresh imported ${report.importedFiles} files and ${report.importedCommits} commits.`,
        },
        ["refresh"],
      );
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    }

    if (name === "memorymesh_propose_skill") {
      const raw = (params.arguments as Record<string, unknown> | undefined) ?? params;
      const skill = this.app.proposeSkill(typeof raw.name === "string" ? raw.name : undefined);
      this.captureInteractionResult(
        name,
        {
          summary: skill
            ? `Proposed draft skill ${skill.name} from ${skill.evidenceEpisodeIds.length} episodes.`
            : "No skill proposal created because there was not enough evidence.",
        },
        ["skill"],
      );
      return {
        content: [
          {
            type: "text",
            text: skill ? JSON.stringify(skill, null, 2) : "Not enough evidence to propose a skill yet.",
          },
        ],
      };
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }

  private captureInteractionCall(name: string, params: Record<string, unknown>): void {
    const rawArgs = (params.arguments as Record<string, unknown> | undefined) ?? params;
    this.app.recordMcpEvent(
      "tool_call",
      {
        name,
        arguments: rawArgs,
        summary: `MCP call ${name}`,
      },
      {
        sessionId: this.sessionId,
        tags: [name],
        projectNow: false,
      },
    );
  }

  private captureInteractionResult(name: string, payload: Record<string, unknown>, extraTags: string[] = []): void {
    this.app.recordMcpEvent(
      "tool_result",
      {
        name,
        ...payload,
      },
      {
        sessionId: this.sessionId,
        tags: [name, ...extraTags],
        projectNow: true,
      },
    );
  }

  private renderQueryResult(result: QueryResult): string {
    const citations = result.citations.map((citation) => `- ${citation}`).join("\n");
    return `Answer:\n${result.answer}\n\nCitations:\n${citations || "- none"}`;
  }
}
