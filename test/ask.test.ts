import { describe, it, expect, afterEach } from "vitest";
import { askQuestion } from "../src/search/ask";
import { addEntry } from "../src/core/knowledge";
import { saveQueue, makeTask } from "../src/core/tasks";
import { writeCheckpoint, makeCheckpoint } from "../src/core/checkpoints";
import { tmpProject, writeMemory } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("askQuestion — finds and cites stored answers", () => {
  it("answers a decision question with the decision and its source", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, {
      type: "decision",
      title: "Use Polymarket for odds",
      reason: "Deeper liquidity than Kalshi",
      alternatives: ["Kalshi"],
    });

    const res = await askQuestion(p, "Why did we choose Polymarket?");
    expect(res.found).toBe(true);
    expect(res.bestDecision?.title).toBe("Use Polymarket for odds");
    expect(res.sources.some((s) => s.type === "decision")).toBe(true);
    expect(res.confidence).not.toBe("low"); // strong single-term match
  });

  it("pulls relevant sources across memory, tasks, and checkpoints", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.architecture, "# Architecture\nThe sync engine uses a queue.\n");
    await saveQueue(p, [makeTask({ title: "Build sync engine", source: "unfinished" })]);
    await writeCheckpoint(
      p,
      makeCheckpoint({ summary: "Started sync engine", changed: [], filesModified: [], worked: [], failed: [] })
    );

    const res = await askQuestion(p, "what is the state of the sync engine?");
    expect(res.found).toBe(true);
    const types = new Set(res.sources.map((s) => s.type));
    expect(types.has("memory")).toBe(true);
    expect(types.has("task")).toBe(true);
    expect(types.has("checkpoint")).toBe(true);
  });

  it("labels every source with its type internally", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "lesson", title: "Polymarket rate-limits aggressively" });
    const res = await askQuestion(p, "polymarket rate limits");
    expect(res.sources.length).toBeGreaterThan(0);
    for (const s of res.sources) {
      expect(["decision", "knowledge", "memory", "task", "checkpoint"]).toContain(s.type);
      expect(s.label).toBeTruthy();
    }
  });
});

describe("askQuestion — honest no-answer behavior", () => {
  it("returns found=false and low confidence when nothing matches", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "decision", title: "Use Postgres", reason: "relational" });

    const res = await askQuestion(p, "what is our kubernetes autoscaling policy?");
    expect(res.found).toBe(false);
    expect(res.confidence).toBe("low");
    expect(res.bestDecision).toBeUndefined();
    expect(res.sources).toEqual([]);
  });

  it("does not crash on an empty project", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const res = await askQuestion(p, "anything at all");
    expect(res.found).toBe(false);
  });
});

describe("confidence heuristic", () => {
  it("is higher when more query terms match a single source", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, {
      type: "decision",
      title: "Polymarket liquidity engine design",
      reason: "liquidity routing across markets",
    });
    const strong = await askQuestion(p, "polymarket liquidity engine");
    expect(strong.confidence).toBe("high");
  });
});
