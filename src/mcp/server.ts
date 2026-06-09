import { TOOLS, findTool } from "./tools";

/**
 * A minimal, dependency-free MCP server over stdio (newline-delimited JSON-RPC
 * 2.0). We hand-roll the small protocol surface we need — initialize,
 * tools/list, tools/call, ping — rather than pull in an ESM-only SDK into this
 * CommonJS project. `handleMessage` is pure (request -> response | null) so it
 * unit-tests without a live transport.
 */

export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "continuity", version: "0.8.0" };

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Handle a single JSON-RPC message. Returns a response, or null for
 * notifications (messages without an id) that require no reply.
 */
export async function handleMessage(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined || msg.id === null;

  try {
    switch (msg.method) {
      case "initialize":
        return ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });

      case "notifications/initialized":
      case "initialized":
        return null; // notification

      case "ping":
        return ok(id, {});

      case "tools/list":
        return ok(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });

      case "tools/call": {
        const name = typeof msg.params?.name === "string" ? msg.params.name : "";
        const tool = findTool(name);
        if (!tool) {
          return ok(id, { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true });
        }
        const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
        try {
          const text = await tool.run(args);
          return ok(id, { content: [{ type: "text", text }] });
        } catch (err) {
          return ok(id, { content: [{ type: "text", text: `Error: ${errMsg(err)}` }], isError: true });
        }
      }

      default:
        if (isNotification) return null;
        return fail(id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (err) {
    if (isNotification) return null;
    return fail(id, -32603, errMsg(err));
  }
}

/**
 * Run the stdio server: read newline-delimited JSON-RPC from stdin, write
 * responses to stdout. Messages are processed serially so responses stay
 * ordered. Only JSON-RPC goes to stdout — diagnostics must use stderr.
 */
export function startStdioServer(): void {
  let buffer = "";
  let chain: Promise<void> = Promise.resolve();

  const write = (res: JsonRpcResponse) => {
    process.stdout.write(JSON.stringify(res) + "\n");
  };

  const processLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      write(fail(null, -32700, "Parse error"));
      return;
    }
    const res = await handleMessage(req);
    if (res) write(res);
  };

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      chain = chain.then(() => processLine(line));
    }
  });
  process.stdin.on("end", () => {
    chain = chain.then(() => process.exit(0));
  });
  process.stdin.resume();

  process.stderr.write("Continuity MCP server ready (stdio).\n");
}
