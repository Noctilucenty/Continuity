import { describe, it, expect, afterEach } from "vitest";
import {
  loadMetrics,
  saveMetrics,
  defaultMetrics,
  bump,
  recordCompletion,
  velocity,
  summarizeMetrics,
} from "../src/store/metrics";
import { writeJson } from "../src/utils/fs";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("loadMetrics — migration tolerant", () => {
  it("returns zeroed defaults when no file exists", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const m = await loadMetrics(p);
    expect(m.counters.checkpoints).toBe(0);
    expect(m.counters.tasksCompleted).toBe(0);
    expect(m.completions).toEqual([]);
  });

  it("merges defaults into a partial/old metrics file", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    // Old file missing newer counters and handoffsByTarget.
    await writeJson(p.metrics, { counters: { checkpoints: 3 } });
    const m = await loadMetrics(p);
    expect(m.counters.checkpoints).toBe(3);
    expect(m.counters.asks).toBe(0); // filled from defaults
    expect(m.handoffsByTarget).toEqual({});
  });
});

describe("bump", () => {
  it("increments a counter and persists", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await bump(p, "checkpoints");
    await bump(p, "checkpoints", 2);
    const m = await loadMetrics(p);
    expect(m.counters.checkpoints).toBe(3);
  });

  it("tracks handoffs by target", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await bump(p, "handoffs", 1, { target: "gpt" });
    await bump(p, "handoffs", 1, { target: "gpt" });
    await bump(p, "handoffs", 1, { target: "claude" });
    const m = await loadMetrics(p);
    expect(m.counters.handoffs).toBe(3);
    expect(m.handoffsByTarget).toEqual({ gpt: 2, claude: 1 });
  });

  it("never throws even if the project dir is gone (best-effort)", async () => {
    const { p, cleanup } = await tmpProject();
    await cleanup(); // remove the dir first
    await expect(bump(p, "asks")).resolves.toBeUndefined();
  });
});

describe("recordCompletion + velocity", () => {
  it("counts completions and computes 7-day velocity", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const nowMs = Date.now();
    await recordCompletion(p, new Date(nowMs - 1 * 86_400_000).toISOString()); // 1 day ago
    await recordCompletion(p, new Date(nowMs - 2 * 86_400_000).toISOString()); // 2 days ago
    await recordCompletion(p, new Date(nowMs - 30 * 86_400_000).toISOString()); // 30 days ago

    const m = await loadMetrics(p);
    expect(m.counters.tasksCompleted).toBe(3);

    const v = velocity(m, nowMs);
    expect(v.total).toBe(3);
    expect(v.last7Days).toBe(2); // the 30-day-old one is excluded
    expect(v.perDay7).toBeCloseTo(2 / 7, 1);
  });

  it("ignores malformed completion timestamps", () => {
    const m = defaultMetrics();
    m.completions = ["not-a-date", new Date().toISOString()];
    m.counters.tasksCompleted = 2;
    const v = velocity(m);
    expect(v.last7Days).toBe(1);
  });
});

describe("summarizeMetrics", () => {
  it("produces readable lines", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await bump(p, "checkpoints", 5);
    await recordCompletion(p);
    const lines = summarizeMetrics(await loadMetrics(p));
    expect(lines.some((l) => l.includes("checkpoints: 5"))).toBe(true);
    expect(lines.some((l) => l.includes("tasks completed: 1"))).toBe(true);
  });
});
