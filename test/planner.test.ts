import { describe, it, expect, afterEach } from "vitest";
import { generateTasks } from "../src/core/planner";
import { tmpProject, writeMemory } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("generateTasks", () => {
  it("turns open bugs into bug-sourced tasks", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.bugs, "# Bugs\n- Probabilities cap at 100%\n");
    const tasks = await generateTasks(p);
    const bug = tasks.find((t) => t.source === "bug");
    expect(bug).toBeDefined();
    expect(bug!.title).toContain("Probabilities cap");
  });

  it("turns next actions into unfinished work", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.nextActions, "# Next\n- Wire the odds feed\n");
    const tasks = await generateTasks(p);
    expect(tasks.some((t) => t.source === "unfinished" && t.title.includes("odds feed"))).toBe(true);
  });

  it("turns risks into de-risking tasks", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.risks, "# Risks\n- API rate limits unknown\n");
    const tasks = await generateTasks(p);
    expect(tasks.some((t) => t.source === "risk" && t.title.startsWith("De-risk:"))).toBe(true);
  });

  it("flags thin/empty memory files as docs tasks", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    // No memory files written at all -> every section is empty -> docs tasks.
    const tasks = await generateTasks(p);
    expect(tasks.some((t) => t.source === "docs" && /Document vision/.test(t.title))).toBe(true);
  });

  it("suggests tests when architecture has an API but state shows no testing", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.architecture, "# Architecture\nWe expose a REST api and modules.");
    await writeMemory(p.memory.currentState, "# State\nImplemented the core. Working on more.");
    const tasks = await generateTasks(p);
    expect(tasks.some((t) => t.source === "tests")).toBe(true);
  });
});
