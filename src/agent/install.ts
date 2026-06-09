import { promises as fs } from "fs";
import path from "path";
import { Paths } from "../core/paths";
import { pathExists, readText, writeText, readJson } from "../utils/fs";

/**
 * Agent hook installer (v0.8).
 *
 * Wires AI coding agents (Claude Code, Codex, Cursor) to Continuity so they call
 * `continuity_resume` at session start and `continuity_checkpoint` before
 * stopping — automatically. It does two things per runner:
 *   1. merges a `continuity` MCP server entry into the runner's MCP config, and
 *   2. appends a delimited lifecycle instruction block to the runner's
 *      instruction file.
 *
 * Both operations are idempotent and non-clobbering: JSON merges preserve
 * existing keys (with a .bak), and instruction blocks are delimited by markers
 * so re-running replaces the block instead of duplicating it. The pure helpers
 * (upsertBlock, removeBlock, mergeMcpServer) are unit-tested directly.
 */

export type Runner = "claude" | "codex" | "cursor";
export const RUNNERS: Runner[] = ["claude", "codex", "cursor"];

export const BLOCK_START = "<!-- continuity:start -->";
export const BLOCK_END = "<!-- continuity:end -->";

export const INSTRUCTION_BLOCK = [
  BLOCK_START,
  "## Continuity lifecycle (managed by Continuity)",
  "",
  "This repository uses Continuity to stay continuous across sessions and agents.",
  "",
  "- At the START of a session, call the `continuity_resume` tool to load the next",
  "  task, current state, and recent decisions. CLI fallback: `continuity resume`.",
  "- Before you STOP, hit a limit, or finish a task, call `continuity_checkpoint`",
  "  with a one-line summary plus what changed, decisions made, failures hit, and",
  "  the next action. CLI fallback: `continuity checkpoint`.",
  "- Respect prior decisions returned by resume; do not re-litigate them.",
  BLOCK_END,
  "",
].join("\n");

const SERVER_NAME = "continuity";
const SERVER_DEF = { command: "continuity", args: ["mcp"] };

interface RunnerConfig {
  instructionFile: string; // relative to root
  mcpFile?: string; // relative to root, if the runner uses an MCP JSON config
}

function runnerConfig(runner: Runner): RunnerConfig {
  switch (runner) {
    case "claude":
      return { instructionFile: "CLAUDE.md", mcpFile: ".mcp.json" };
    case "cursor":
      return { instructionFile: path.join(".cursor", "rules", "continuity.md"), mcpFile: path.join(".cursor", "mcp.json") };
    case "codex":
      // Codex reads AGENTS.md; its MCP server is configured globally (TOML), so
      // we only manage the instruction file here and document the MCP setup.
      return { instructionFile: "AGENTS.md" };
  }
}

/* ---------- pure helpers ---------- */

/** Insert or replace the delimited Continuity block in a document. */
export function upsertBlock(content: string, block: string = INSTRUCTION_BLOCK): string {
  const trimmedBlock = block.trim();
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = content.slice(0, start).replace(/\s+$/, "");
    const after = content.slice(end + BLOCK_END.length).replace(/^\s+/, "");
    const parts = [before, trimmedBlock, after].filter((s) => s.length > 0);
    return parts.join("\n\n") + "\n";
  }
  if (!content.trim()) return trimmedBlock + "\n";
  return content.replace(/\s+$/, "") + "\n\n" + trimmedBlock + "\n";
}

/** Remove the delimited Continuity block from a document. */
export function removeBlock(content: string): string {
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return content;
  const before = content.slice(0, start).replace(/\s+$/, "");
  const after = content.slice(end + BLOCK_END.length).replace(/^\s+/, "");
  const parts = [before, after].filter((s) => s.length > 0);
  return parts.length ? parts.join("\n\n") + "\n" : "";
}

/** Merge the continuity server into an MCP-config object, preserving others. */
export function mergeMcpServer(existing: Record<string, unknown>): Record<string, unknown> {
  const out = { ...existing };
  const servers = { ...((out.mcpServers as Record<string, unknown>) ?? {}) };
  servers[SERVER_NAME] = { ...SERVER_DEF };
  out.mcpServers = servers;
  return out;
}

/** Remove the continuity server from an MCP-config object. */
export function removeMcpServer(existing: Record<string, unknown>): Record<string, unknown> {
  const out = { ...existing };
  const servers = { ...((out.mcpServers as Record<string, unknown>) ?? {}) };
  delete servers[SERVER_NAME];
  out.mcpServers = servers;
  return out;
}

/* ---------- IO ---------- */

export interface InstallChange {
  file: string; // relative path
  action: "created" | "updated";
}

async function backup(abs: string): Promise<void> {
  if (await pathExists(abs)) await fs.copyFile(abs, abs + ".bak");
}

export async function installRunner(p: Paths, runner: Runner): Promise<InstallChange[]> {
  const cfg = runnerConfig(runner);
  const changes: InstallChange[] = [];

  // Instruction file
  const instrAbs = path.join(p.cwd, cfg.instructionFile);
  const existedInstr = await pathExists(instrAbs);
  const current = await readText(instrAbs, "");
  await backup(instrAbs);
  await writeText(instrAbs, upsertBlock(current));
  changes.push({ file: cfg.instructionFile, action: existedInstr ? "updated" : "created" });

  // MCP config (if the runner uses one)
  if (cfg.mcpFile) {
    const mcpAbs = path.join(p.cwd, cfg.mcpFile);
    const existedMcp = await pathExists(mcpAbs);
    const existing = await readJson<Record<string, unknown>>(mcpAbs, {});
    await backup(mcpAbs);
    await writeText(mcpAbs, JSON.stringify(mergeMcpServer(existing), null, 2) + "\n");
    changes.push({ file: cfg.mcpFile, action: existedMcp ? "updated" : "created" });
  }

  return changes;
}

export async function uninstallRunner(p: Paths, runner: Runner): Promise<string[]> {
  const cfg = runnerConfig(runner);
  const removed: string[] = [];

  const instrAbs = path.join(p.cwd, cfg.instructionFile);
  if (await pathExists(instrAbs)) {
    const current = await readText(instrAbs, "");
    if (current.includes(BLOCK_START)) {
      await writeText(instrAbs, removeBlock(current));
      removed.push(cfg.instructionFile);
    }
  }

  if (cfg.mcpFile) {
    const mcpAbs = path.join(p.cwd, cfg.mcpFile);
    if (await pathExists(mcpAbs)) {
      const existing = await readJson<Record<string, unknown>>(mcpAbs, {});
      const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
      if (SERVER_NAME in servers) {
        await writeText(mcpAbs, JSON.stringify(removeMcpServer(existing), null, 2) + "\n");
        removed.push(cfg.mcpFile);
      }
    }
  }

  return removed;
}

export interface RunnerStatus {
  runner: Runner;
  instructionInstalled: boolean;
  mcpInstalled: boolean | null; // null when the runner has no MCP JSON config
}

export async function runnerStatus(p: Paths, runner: Runner): Promise<RunnerStatus> {
  const cfg = runnerConfig(runner);
  const instr = await readText(path.join(p.cwd, cfg.instructionFile), "");
  let mcpInstalled: boolean | null = null;
  if (cfg.mcpFile) {
    const existing = await readJson<Record<string, unknown>>(path.join(p.cwd, cfg.mcpFile), {});
    const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
    mcpInstalled = SERVER_NAME in servers;
  }
  return {
    runner,
    instructionInstalled: instr.includes(BLOCK_START),
    mcpInstalled,
  };
}
