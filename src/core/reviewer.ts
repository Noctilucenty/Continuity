import { Paths, memoryFiles } from "./paths";
import { Task } from "../types";
import { readMemory, extractListItems } from "./memory";
import { loadQueue, nextActionable, sortedByPriority } from "./tasks";
import { truncate } from "../utils/format";

/**
 * The reviewer audits the project and answers five questions:
 *   what needs improvement, what is risky, what should be tested,
 *   what should be documented, and what the single highest-leverage move is.
 *
 * It shares the planner's primitives (memory + extractListItems + the same task
 * scoring) so its findings never contradict what `next` would tell you to do.
 */

export interface Review {
  needsImprovement: string[];
  risky: string[];
  shouldTest: string[];
  shouldDocument: string[];
  highestLeverage: string;
}

export async function review(p: Paths): Promise<Review> {
  const memory = await readMemory(p);
  const queue = await loadQueue(p);

  return {
    needsImprovement: needsImprovement(queue),
    risky: risky(memory),
    shouldTest: shouldTest(memory),
    shouldDocument: shouldDocument(p, memory),
    highestLeverage: highestLeverage(queue),
  };
}

function needsImprovement(queue: Task[]): string[] {
  const out: string[] = [];
  const blocked = queue.filter((t) => t.status === "blocked");
  for (const t of blocked) out.push(`Unblock: ${t.title}`);

  const inProgress = queue.filter((t) => t.status === "in_progress");
  if (inProgress.length > 1) {
    out.push(
      `${inProgress.length} tasks are in progress at once — finish one before starting another.`
    );
  }

  const stale = queue
    .filter((t) => t.status === "todo")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (stale && queue.length > 5) {
    out.push(`Oldest open task is starving: ${stale.title}`);
  }

  if (out.length === 0) out.push("No structural problems detected in the task queue.");
  return out;
}

function risky(memory: Record<string, string>): string[] {
  const out = extractListItems(memory.risks ?? "").map((r) => truncate(r, 100));
  const bugs = extractListItems(memory.bugs ?? "");
  if (bugs.length > 0) {
    out.push(`${bugs.length} open bug(s) are unresolved risk to correctness.`);
  }
  if (out.length === 0) out.push("No risks recorded — consider whether that's accurate.");
  return out;
}

function shouldTest(memory: Record<string, string>): string[] {
  const out: string[] = [];
  const state = (memory.current_state ?? "").toLowerCase();
  const arch = (memory.architecture ?? "").toLowerCase();
  if (!state.includes("test")) {
    out.push("Current state mentions no testing — add coverage for the core path.");
  }
  if (arch.includes("api") || arch.includes("integration")) {
    out.push("Integration/API surfaces described — add contract or smoke tests around them.");
  }
  if (out.length === 0) out.push("Testing appears to be tracked. Keep coverage current.");
  return out;
}

function shouldDocument(p: Paths, memory: Record<string, string>): string[] {
  const out: string[] = [];
  for (const { name } of memoryFiles(p)) {
    const content = (memory[name] ?? "").trim();
    if (content.length < 40) out.push(`${name.replace(/_/g, " ")} is empty or placeholder.`);
  }
  if (out.length === 0) out.push("Memory files have real content. Keep them fresh on each checkpoint.");
  return out;
}

function highestLeverage(queue: Task[]): string {
  const next = nextActionable(queue);
  if (next) return next.title;
  const top = sortedByPriority(queue)[0];
  if (top) return top.title;
  return "Run `continuity plan \"<goal>\"` to generate the first task.";
}
