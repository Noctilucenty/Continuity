import { startStdioServer } from "../mcp/server";

/**
 * `continuity mcp` — run the Model Context Protocol server over stdio. AI agents
 * (Claude Code, Cursor, Codex) launch this so they can call Continuity's tools
 * (resume, checkpoint, status, handoff, ...) automatically.
 *
 * Stdout is the JSON-RPC channel, so this command never prints to stdout itself.
 */
export async function mcp(): Promise<void> {
  startStdioServer();
  // Keep the process alive; the server resolves only when stdin closes.
  await new Promise<void>(() => {});
}
