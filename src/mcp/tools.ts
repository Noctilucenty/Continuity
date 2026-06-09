import path from "path";
import { paths, Paths } from "../core/paths";
import * as service from "../service";

/**
 * MCP tool definitions. Each tool advertises a JSON Schema and a `run` handler
 * that resolves the project root and delegates to the service layer (plain
 * text, never throws on an uninitialized project). Handlers are plain async
 * functions so they unit-test without a live transport.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<string>;
}

function resolveRoot(args: Record<string, unknown>): Paths {
  const root = typeof args.root === "string" && args.root.trim() ? path.resolve(args.root) : process.cwd();
  return paths(root);
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

const rootProp = {
  root: {
    type: "string",
    description: "Project root directory (defaults to the server's working directory)",
  },
};

export const TOOLS: McpTool[] = [
  {
    name: "continuity_resume",
    description:
      "Load what was in progress for this project: the next task, current state, recent decisions, and any blocker. Call at the start of a session.",
    inputSchema: { type: "object", properties: { ...rootProp } },
    run: (a) => service.resumeBrief(resolveRoot(a)),
  },
  {
    name: "continuity_checkpoint",
    description:
      "Save the current state before you stop, hit a limit, or finish a task. Provide a summary plus what changed, decisions made, failures hit, and the next action.",
    inputSchema: {
      type: "object",
      required: ["summary"],
      properties: {
        ...rootProp,
        summary: { type: "string", description: "One-line summary of what happened" },
        changed: { type: "array", items: { type: "string" }, description: "What changed" },
        files: { type: "array", items: { type: "string" }, description: "Files modified" },
        decisions: { type: "array", items: { type: "string" }, description: "Decisions made" },
        failures: { type: "array", items: { type: "string" }, description: "Failures or broken things hit" },
        next: { type: "string", description: "The next action for whoever resumes" },
        blocker: { type: "string", description: "Current blocker, if any" },
      },
    },
    run: (a) => {
      const summary = str(a.summary);
      if (!summary) return Promise.resolve("Error: 'summary' is required.");
      return service.recordCheckpoint(resolveRoot(a), {
        summary,
        changed: strArray(a.changed),
        files: strArray(a.files),
        decisions: strArray(a.decisions),
        failures: strArray(a.failures),
        next: str(a.next),
        blocker: str(a.blocker),
      });
    },
  },
  {
    name: "continuity_status",
    description: "A compact summary of the project: state, task counts, checkpoints, and the next action.",
    inputSchema: { type: "object", properties: { ...rootProp } },
    run: (a) => service.statusSummary(resolveRoot(a)),
  },
  {
    name: "continuity_handoff",
    description:
      "Get a paste-ready, model-specific handoff briefing. 'to' is one of claude, gpt, cursor, gemini, generic.",
    inputSchema: {
      type: "object",
      properties: { ...rootProp, to: { type: "string", description: "Target agent" } },
    },
    run: (a) => service.handoffDoc(resolveRoot(a), str(a.to)),
  },
  {
    name: "continuity_next",
    description: "Show the single highest-leverage next task.",
    inputSchema: { type: "object", properties: { ...rootProp } },
    run: (a) => service.nextTaskText(resolveRoot(a)),
  },
  {
    name: "continuity_done",
    description: "Mark a task complete (defaults to the current next task). Optionally pass a taskId.",
    inputSchema: {
      type: "object",
      properties: { ...rootProp, taskId: { type: "string", description: "Task id or prefix" } },
    },
    run: (a) => service.completeTaskText(resolveRoot(a), str(a.taskId)),
  },
  {
    name: "continuity_ask",
    description: "Answer a question from stored project memory (deterministic, cites sources, reports confidence).",
    inputSchema: {
      type: "object",
      required: ["question"],
      properties: { ...rootProp, question: { type: "string", description: "The question" } },
    },
    run: (a) => {
      const question = str(a.question);
      if (!question) return Promise.resolve("Error: 'question' is required.");
      return service.answerText(resolveRoot(a), question);
    },
  },
  {
    name: "continuity_recall",
    description: "Search project memory and decisions for a keyword query.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { ...rootProp, query: { type: "string", description: "Search query" } },
    },
    run: (a) => {
      const query = str(a.query);
      if (!query) return Promise.resolve("Error: 'query' is required.");
      return service.recallText(resolveRoot(a), query);
    },
  },
];

export function findTool(name: string): McpTool | undefined {
  return TOOLS.find((t) => t.name === name);
}
