import { describe, it, expect, afterEach } from "vitest";
import {
  scoreTask,
  makeTask,
  mergeTasks,
  sortedByPriority,
  nextActionable,
  findTask,
  updateStatus,
  completeTask,
  saveQueue,
  loadQueue,
  loadCompleted,
  SOURCE_WEIGHTS,
} from "../src/core/tasks";
import { Task } from "../src/types";
import { tmpProject } from "./helpers";

function task(partial: Partial<Task>): Task {
  const base = makeTask({ title: partial.title ?? "t", source: partial.source ?? "manual" });
  return { ...base, ...partial };
}

describe("scoreTask", () => {
  it("ranks bugs above everything and improvements last", () => {
    expect(scoreTask({ source: "bug", status: "todo" })).toBe(SOURCE_WEIGHTS.bug);
    expect(scoreTask({ source: "bug", status: "todo" })).toBeGreaterThan(
      scoreTask({ source: "improvement", status: "todo" })
    );
  });
  it("gives in-progress a bonus and blocked a penalty", () => {
    expect(scoreTask({ source: "docs", status: "in_progress" })).toBeGreaterThan(
      scoreTask({ source: "docs", status: "todo" })
    );
    expect(scoreTask({ source: "bug", status: "blocked" })).toBeLessThan(
      scoreTask({ source: "docs", status: "todo" })
    );
  });
});

describe("mergeTasks", () => {
  it("adds new tasks and dedupes by case-insensitive title", () => {
    const existing = [task({ title: "Fix bug" })];
    const { merged, added } = mergeTasks(existing, [
      { title: "fix bug", source: "bug" }, // dup (case-insensitive)
      { title: "Write docs", source: "docs" }, // new
    ]);
    expect(added).toHaveLength(1);
    expect(added[0].title).toBe("Write docs");
    expect(merged).toHaveLength(2);
  });

  it("dedupes within the incoming batch too", () => {
    const { added } = mergeTasks([], [
      { title: "Same", source: "manual" },
      { title: "same", source: "bug" },
    ]);
    expect(added).toHaveLength(1);
  });
});

describe("sortedByPriority", () => {
  it("orders by score then by age as a tie-break", () => {
    const older = task({ title: "older docs", source: "docs", createdAt: "2020-01-01T00:00:00Z" });
    const newer = task({ title: "newer docs", source: "docs", createdAt: "2024-01-01T00:00:00Z" });
    const bug = task({ title: "bug", source: "bug" });
    const sorted = sortedByPriority([newer, older, bug]);
    expect(sorted[0].title).toBe("bug");
    expect(sorted[1].title).toBe("older docs"); // tie-break: older first
  });
});

describe("nextActionable — the consistency anchor", () => {
  it("returns the highest-priority actionable task", () => {
    const tasks = [task({ title: "docs", source: "docs" }), task({ title: "bug", source: "bug" })];
    expect(nextActionable(tasks)!.title).toBe("bug");
  });

  it("prefers an in-progress task even if a higher-source todo exists", () => {
    const tasks = [
      task({ title: "untouched bug", source: "bug", status: "todo" }),
      task({ title: "active docs", source: "docs", status: "in_progress" }),
    ];
    expect(nextActionable(tasks)!.title).toBe("active docs");
  });

  it("ignores blocked and done tasks", () => {
    const tasks = [
      task({ title: "blocked bug", source: "bug", status: "blocked" }),
      task({ title: "done thing", source: "bug", status: "done" }),
      task({ title: "open docs", source: "docs", status: "todo" }),
    ];
    expect(nextActionable(tasks)!.title).toBe("open docs");
  });

  it("returns undefined when nothing is actionable", () => {
    expect(nextActionable([])).toBeUndefined();
    expect(nextActionable([task({ status: "done" })])).toBeUndefined();
  });
});

describe("findTask", () => {
  it("matches by exact id and by prefix", () => {
    const t = task({ title: "x" });
    expect(findTask([t], t.id)).toBe(t);
    expect(findTask([t], t.id.slice(0, 5))).toBe(t);
    expect(findTask([t], "nope")).toBeUndefined();
  });
});

describe("updateStatus", () => {
  it("rewrites status and recomputes priority", () => {
    const t = task({ source: "docs", status: "todo" });
    const updated = updateStatus(t, "in_progress");
    expect(updated.status).toBe("in_progress");
    expect(updated.priority).toBe(scoreTask({ source: "docs", status: "in_progress" }));
    expect(updated.updatedAt >= t.createdAt).toBe(true);
  });
});

describe("completeTask", () => {
  let cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.map((c) => c()));
    cleanups = [];
  });

  it("moves the next task from queue to completed and reports the new next", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await saveQueue(p, [
      makeTask({ title: "fix bug", source: "bug" }), // highest priority
      makeTask({ title: "write docs", source: "docs" }),
    ]);

    const result = await completeTask(p);
    expect(result?.completed.title).toBe("fix bug");
    expect(result?.completed.status).toBe("done");
    expect(result?.next?.title).toBe("write docs");

    expect((await loadQueue(p)).map((t) => t.title)).toEqual(["write docs"]);
    expect((await loadCompleted(p)).map((t) => t.title)).toEqual(["fix bug"]);
  });

  it("completes a specific task by id prefix", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const docs = makeTask({ title: "write docs", source: "docs" });
    await saveQueue(p, [makeTask({ title: "fix bug", source: "bug" }), docs]);

    const result = await completeTask(p, docs.id);
    expect(result?.completed.title).toBe("write docs");
    expect((await loadQueue(p)).map((t) => t.title)).toEqual(["fix bug"]);
  });

  it("returns null when there is nothing to complete", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await saveQueue(p, []);
    expect(await completeTask(p)).toBeNull();
    expect(await completeTask(p, "nope")).toBeNull();
  });
});
