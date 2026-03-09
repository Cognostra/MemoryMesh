import { expect, test } from "bun:test";
import { MemoryMeshApp } from "../src/app";
import { MemoryMeshMcpServer } from "../src/mcp";
import { createFixtureRepo } from "./helpers";

test("mcp server lists tools and can answer search requests", async () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);
  const server = new MemoryMeshMcpServer(app);

  const tools = await server.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  });
  expect(tools?.result).toBeDefined();

  const result = await server.handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "memorymesh_search",
      arguments: {
        query: "local-first",
      },
    },
  });

  const payload = result?.result as { content: Array<{ text: string }> };
  expect(payload.content[0]?.text).toContain("Citations");
  const events = app.storage.listEvents();
  expect(events.some((event) => event.source === "mcp" && event.kind === "tool_call")).toBe(true);
  expect(events.some((event) => event.source === "mcp" && event.kind === "tool_result")).toBe(true);
  const recent = app.getRecentEpisodes(5);
  const sessionEpisode = recent.find((episode) => episode.title.includes("MCP session"));
  expect(sessionEpisode).toBeDefined();
  expect(sessionEpisode?.summary).toContain("memorymesh_search");

  app.close();
});

test("mcp resource reads are captured as local memory", async () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);
  const server = new MemoryMeshMcpServer(app);

  const result = await server.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "resources/read",
    params: {
      uri: "memorymesh://overview",
    },
  });

  expect(result?.result).toBeDefined();
  const events = app.storage.listEvents();
  expect(events.some((event) => event.source === "mcp" && event.payloadJson.includes("resources/read"))).toBe(true);
  const sessionEpisode = app.getRecentEpisodes(5).find((episode) => episode.title.includes("MCP session"));
  expect(sessionEpisode).toBeDefined();
  expect(sessionEpisode?.summary).toContain("resources/read");

  app.close();
});

test("mcp interactions within one session aggregate into a single recent episode", async () => {
  const repoRoot = createFixtureRepo();
  const { app } = MemoryMeshApp.init(repoRoot);
  const server = new MemoryMeshMcpServer(app);

  await server.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "memorymesh_search",
      arguments: { query: "local-first" },
    },
  });

  await server.handleRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "resources/read",
    params: {
      uri: "memorymesh://overview",
    },
  });

  const sessionEpisodes = app.getRecentEpisodes(10).filter((episode) => episode.title.includes("MCP session"));
  expect(sessionEpisodes.length).toBe(1);
  expect(sessionEpisodes[0]?.summary).toContain("memorymesh_search");
  expect(sessionEpisodes[0]?.summary).toContain("resources/read");

  app.close();
});
