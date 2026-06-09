import { describe, it, expect, afterEach } from "vitest";
import path from "path";
import {
  upsertBlock,
  removeBlock,
  mergeMcpServer,
  removeMcpServer,
  installRunner,
  uninstallRunner,
  runnerStatus,
  BLOCK_START,
  BLOCK_END,
} from "../src/agent/install";
import { readText, readJson, writeText, pathExists } from "../src/utils/fs";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("upsertBlock / removeBlock", () => {
  it("adds a block to empty content", () => {
    const out = upsertBlock("");
    expect(out).toContain(BLOCK_START);
    expect(out).toContain(BLOCK_END);
  });

  it("appends to existing content without losing it", () => {
    const out = upsertBlock("# My agent rules\n\nDo the thing.\n");
    expect(out).toContain("My agent rules");
    expect(out).toContain("Do the thing.");
    expect(count(out, BLOCK_START)).toBe(1);
  });

  it("replaces an existing block (idempotent, no duplication)", () => {
    const once = upsertBlock("# Rules\n");
    const twice = upsertBlock(once);
    expect(count(twice, BLOCK_START)).toBe(1);
    expect(twice).toContain("# Rules");
  });

  it("removeBlock strips the block but keeps surrounding content", () => {
    const withBlock = upsertBlock("# Rules\n\ncustom line\n");
    const without = removeBlock(withBlock);
    expect(without).toContain("# Rules");
    expect(without).toContain("custom line");
    expect(without).not.toContain(BLOCK_START);
  });
});

describe("mergeMcpServer / removeMcpServer", () => {
  it("adds the continuity server to an empty config", () => {
    const out = mergeMcpServer({}) as { mcpServers: Record<string, unknown> };
    expect(out.mcpServers.continuity).toEqual({ command: "continuity", args: ["mcp"] });
  });

  it("preserves existing servers", () => {
    const out = mergeMcpServer({ mcpServers: { other: { command: "x" } } }) as {
      mcpServers: Record<string, unknown>;
    };
    expect(out.mcpServers.other).toEqual({ command: "x" });
    expect(out.mcpServers.continuity).toBeDefined();
  });

  it("removes only the continuity server", () => {
    const merged = mergeMcpServer({ mcpServers: { other: { command: "x" } } });
    const out = removeMcpServer(merged) as { mcpServers: Record<string, unknown> };
    expect(out.mcpServers.continuity).toBeUndefined();
    expect(out.mcpServers.other).toEqual({ command: "x" });
  });
});

describe("installRunner (claude)", () => {
  it("creates CLAUDE.md block and .mcp.json server entry", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await installRunner(p, "claude");

    const claudeMd = await readText(path.join(p.cwd, "CLAUDE.md"), "");
    expect(claudeMd).toContain(BLOCK_START);
    expect(claudeMd).toContain("continuity_resume");

    const mcp = await readJson<{ mcpServers: Record<string, unknown> }>(path.join(p.cwd, ".mcp.json"), {
      mcpServers: {},
    });
    expect(mcp.mcpServers.continuity).toBeDefined();
  });

  it("is idempotent and preserves a pre-existing .mcp.json (with backup)", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const mcpPath = path.join(p.cwd, ".mcp.json");
    await writeText(mcpPath, JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));

    await installRunner(p, "claude");
    await installRunner(p, "claude"); // twice

    const claudeMd = await readText(path.join(p.cwd, "CLAUDE.md"), "");
    expect(count(claudeMd, BLOCK_START)).toBe(1);

    const mcp = await readJson<{ mcpServers: Record<string, unknown> }>(mcpPath, { mcpServers: {} });
    expect(mcp.mcpServers.other).toEqual({ command: "x" }); // preserved
    expect(mcp.mcpServers.continuity).toBeDefined();
    expect(await pathExists(mcpPath + ".bak")).toBe(true); // backup written
  });

  it("uninstall removes the block and the server entry", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await installRunner(p, "claude");
    const removed = await uninstallRunner(p, "claude");
    expect(removed.length).toBeGreaterThan(0);

    const claudeMd = await readText(path.join(p.cwd, "CLAUDE.md"), "");
    expect(claudeMd).not.toContain(BLOCK_START);

    const mcp = await readJson<{ mcpServers: Record<string, unknown> }>(path.join(p.cwd, ".mcp.json"), {
      mcpServers: {},
    });
    expect(mcp.mcpServers.continuity).toBeUndefined();
  });
});

describe("installRunner (codex) — instruction only, no MCP json", () => {
  it("writes AGENTS.md and reports mcp as n/a", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await installRunner(p, "codex");
    const agents = await readText(path.join(p.cwd, "AGENTS.md"), "");
    expect(agents).toContain(BLOCK_START);

    const status = await runnerStatus(p, "codex");
    expect(status.instructionInstalled).toBe(true);
    expect(status.mcpInstalled).toBeNull();
  });
});
