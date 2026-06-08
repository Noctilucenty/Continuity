import { describe, it, expect, afterEach } from "vitest";
import { buildPack, renderPack } from "../src/context/contextPack";
import { addEntry } from "../src/core/knowledge";
import { saveQueue, makeTask } from "../src/core/tasks";
import { tmpProject, writeMemory } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("buildPack — topic matching", () => {
  it("gathers decisions, memories, and tasks for a matching topic", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);

    await addEntry(p, {
      type: "decision",
      title: "Use JWT for auth",
      reason: "Stateless sessions across services",
    });
    await writeMemory(p.memory.architecture, "# Architecture\nThe auth service issues JWTs.\n");
    await saveQueue(p, [
      makeTask({ title: "Add auth middleware", source: "unfinished" }),
      makeTask({ title: "Style the footer", source: "improvement" }),
    ]);

    const pack = await buildPack(p, "auth");
    expect(pack.matched).toBe(true);
    expect(pack.decisions.map((d) => d.title)).toContain("Use JWT for auth");
    expect(pack.memories.some((m) => m.name === "architecture")).toBe(true);
    expect(pack.tasks.map((t) => t.title)).toContain("Add auth middleware");
    // unrelated task excluded from the topic match
    expect(pack.tasks.map((t) => t.title)).not.toContain("Style the footer");
  });

  it("is case-insensitive", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "decision", title: "Payments via Stripe", reason: "Best DX" });
    const pack = await buildPack(p, "PAYMENTS");
    expect(pack.matched).toBe(true);
    expect(pack.decisions.length).toBeGreaterThan(0);
  });

  it("works with only partial matches (e.g. just a file path)", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await saveQueue(p, [makeTask({ title: "Build frontend dashboard", source: "unfinished" })]);
    const pack = await buildPack(p, "frontend");
    expect(pack.matched).toBe(true);
    expect(pack.tasks.map((t) => t.title)).toContain("Build frontend dashboard");
  });
});

describe("buildPack — fallback", () => {
  it("does not crash and flags no-match for an unknown topic", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.vision, "# Vision\nA prediction markets app.\n");
    await saveQueue(p, [makeTask({ title: "Wire the odds feed", source: "unfinished" })]);

    const pack = await buildPack(p, "quantum-blockchain-xyz");
    expect(pack.matched).toBe(false);
    expect(pack.topicSummary.toLowerCase()).toContain("no topic-specific");
    // falls back to general context: still surfaces project tasks
    expect(pack.tasks.length).toBeGreaterThan(0);
    expect(pack.projectSummary).toContain("prediction markets");
  });

  it("handles an empty project without throwing", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const pack = await buildPack(p, "anything");
    expect(pack.matched).toBe(false);
    expect(() => renderPack(pack)).not.toThrow();
  });
});

describe("renderPack — output shape", () => {
  it("includes every required section and a paste-ready prompt", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "decision", title: "Use Redis for sync queue", reason: "Speed" });
    const doc = renderPack(await buildPack(p, "sync"));

    for (const heading of [
      "# Context Pack: sync",
      "## Project summary",
      "## Topic summary",
      "## Relevant decisions",
      "## Relevant memories",
      "## Relevant tasks",
      "## Relevant checkpoints",
      "## Relevant files",
      "## Known risks",
      "## Recommended next steps",
      "## Prompt for an AI assistant",
    ]) {
      expect(doc).toContain(heading);
    }
    // the prompt block is fenced
    expect(doc).toContain("```");
  });
});
