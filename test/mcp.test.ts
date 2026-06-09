import { describe, it, expect, afterEach } from "vitest";
import { handleMessage, SERVER_INFO } from "../src/mcp/server";
import { TOOLS } from "../src/mcp/tools";
import { writeJson } from "../src/utils/fs";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

async function initialized() {
  const { p, cleanup } = await tmpProject();
  cleanups.push(cleanup);
  await writeJson(p.config, { name: "Test", version: "0.8.0", createdAt: new Date().toISOString() });
  return p;
}

function call(name: string, args: Record<string, unknown>) {
  return handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
}

describe("MCP protocol handshake", () => {
  it("responds to initialize with protocol + server info", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(res?.result).toMatchObject({ serverInfo: { name: SERVER_INFO.name } });
    expect((res?.result as { protocolVersion: string }).protocolVersion).toBeTruthy();
  });

  it("answers ping", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 2, method: "ping" });
    expect(res?.result).toEqual({});
  });

  it("returns null for notifications (no id)", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res).toBeNull();
  });

  it("errors on an unknown method with an id", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 3, method: "no/such" });
    expect(res?.error?.code).toBe(-32601);
  });

  it("lists all tools with input schemas", async () => {
    const res = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    const names = (res?.result as { tools: { name: string; inputSchema: unknown }[] }).tools.map((t) => t.name);
    for (const t of TOOLS) expect(names).toContain(t.name);
    expect(names).toContain("continuity_resume");
    expect(names).toContain("continuity_checkpoint");
    const tools = (res?.result as { tools: { inputSchema: unknown }[] }).tools;
    expect(tools.every((t) => typeof t.inputSchema === "object")).toBe(true);
  });
});

describe("MCP tools/call", () => {
  it("resume returns a brief on an initialized project", async () => {
    const p = await initialized();
    const res = await call("continuity_resume", { root: p.cwd });
    const text = (res?.result as { content: { text: string }[] }).content[0].text;
    expect(text.toLowerCase()).toContain("resuming");
  });

  it("checkpoint records state and reports the next task", async () => {
    const p = await initialized();
    const res = await call("continuity_checkpoint", {
      root: p.cwd,
      summary: "Wired the feed",
      changed: ["added poller"],
      decisions: ["poll every 5s"],
      failures: ["reconnect drops"],
      next: "add backoff",
    });
    const text = (res?.result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("Checkpoint saved");
  });

  it("status summarizes the project", async () => {
    const p = await initialized();
    const res = await call("continuity_status", { root: p.cwd });
    const text = (res?.result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("Project: Test");
  });

  it("gracefully guides when the project is not initialized (not an error)", async () => {
    const { p, cleanup } = await tmpProject(); // dirs but no config
    cleanups.push(cleanup);
    const res = await call("continuity_resume", { root: p.cwd });
    const result = res?.result as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("No Continuity project");
  });

  it("flags an unknown tool as an error", async () => {
    const res = await call("continuity_nope", {});
    expect((res?.result as { isError?: boolean }).isError).toBe(true);
  });

  it("validates required args", async () => {
    const p = await initialized();
    const res = await call("continuity_ask", { root: p.cwd });
    const text = (res?.result as { content: { text: string }[] }).content[0].text;
    expect(text).toContain("required");
  });

  it("never leaks ANSI escape codes in tool output", async () => {
    const p = await initialized();
    const res = await call("continuity_status", { root: p.cwd });
    const text = (res?.result as { content: { text: string }[] }).content[0].text;
    expect(text).not.toContain(String.fromCharCode(27));
  });
});
