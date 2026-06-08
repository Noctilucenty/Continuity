import { Paths } from "./paths";
import { Task, NewTaskInput, TaskSource, TaskStatus } from "../types";
import { readJson, writeJson } from "../utils/fs";
import { now, shortId } from "../utils/format";

/**
 * The task graph. Tasks are scored so `next`, `review`, and `resume` always
 * agree on what to do. The scoring weights below ARE the tool's opinion about
 * what matters — fix breakage first, finish what you started, then de-risk,
 * test, document, and polish.
 */

export const SOURCE_WEIGHTS: Record<TaskSource, number> = {
  bug: 90, // broken things first
  unfinished: 80, // finish what you started
  risk: 75,
  tests: 70,
  manual: 60,
  docs: 50,
  improvement: 45, // polish last
};

/** Small status nudge so in-progress work outranks an equal-source todo. */
const STATUS_BONUS: Record<TaskStatus, number> = {
  in_progress: 8,
  todo: 0,
  blocked: -50,
  done: -100,
};

export function scoreTask(t: Pick<Task, "source" | "status">): number {
  return SOURCE_WEIGHTS[t.source] + STATUS_BONUS[t.status];
}

export async function loadQueue(p: Paths): Promise<Task[]> {
  return readJson<Task[]>(p.tasks.queue, []);
}

export async function saveQueue(p: Paths, tasks: Task[]): Promise<void> {
  await writeJson(p.tasks.queue, tasks);
}

export async function loadCompleted(p: Paths): Promise<Task[]> {
  return readJson<Task[]>(p.tasks.completed, []);
}

export async function saveCompleted(p: Paths, tasks: Task[]): Promise<void> {
  await writeJson(p.tasks.completed, tasks);
}

export function makeTask(input: NewTaskInput): Task {
  const ts = now();
  return {
    id: shortId("t"),
    title: input.title,
    detail: input.detail,
    source: input.source,
    status: "todo",
    priority: scoreTask({ source: input.source, status: "todo" }),
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Merge newly generated tasks into the queue, skipping ones whose title already
 * exists (case-insensitive). Returns the tasks that were actually added.
 */
export function mergeTasks(existing: Task[], incoming: NewTaskInput[]): {
  merged: Task[];
  added: Task[];
} {
  const seen = new Set(existing.map((t) => t.title.toLowerCase()));
  const added: Task[] = [];
  for (const input of incoming) {
    const key = input.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(makeTask(input));
  }
  return { merged: [...existing, ...added], added };
}

/** Tasks sorted by priority, highest first. */
export function sortedByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const byScore = scoreTask(b) - scoreTask(a);
    if (byScore !== 0) return byScore;
    // Tie-break: older first, so nothing starves.
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * The single consistency anchor: the one task every command should name as
 * "next." In-progress work wins; otherwise the highest-priority actionable
 * (non-blocked, non-done) task.
 */
export function nextActionable(tasks: Task[]): Task | undefined {
  const actionable = tasks.filter(
    (t) => t.status !== "done" && t.status !== "blocked"
  );
  const inProgress = actionable.filter((t) => t.status === "in_progress");
  const pool = inProgress.length > 0 ? inProgress : actionable;
  return sortedByPriority(pool)[0];
}

export function findTask(tasks: Task[], idOrPrefix: string): Task | undefined {
  return (
    tasks.find((t) => t.id === idOrPrefix) ??
    tasks.find((t) => t.id.startsWith(idOrPrefix))
  );
}

export function updateStatus(task: Task, status: TaskStatus): Task {
  return {
    ...task,
    status,
    priority: scoreTask({ source: task.source, status }),
    updatedAt: now(),
  };
}
