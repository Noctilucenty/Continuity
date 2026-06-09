import { describe, expect, it, afterEach } from "vitest";
import { promises as fs } from "fs";
import { gatherDashboard, renderDashboardPlain, renderDashboardScreen, selectedActionIndex } from "../src/ui/dashboard";
import { shouldLaunchTerminalUi } from "../src/ui/terminal";
import { makeTask, saveCompleted, saveQueue, updateStatus } from "../src/core/tasks";
import { writeJson } from "../src/utils/fs";
import { tmpProject, writeMemory } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("interactive dashboard model", () => {
  it("shows an init-first dashboard outside a project", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);

    const model = await gatherDashboard(p);

    expect(model.initialized).toBe(false);
    expect(model.nextAction).toBe("continuity init");
    expect(model.actions.map((a) => a.label)).toEqual(["Wizard"]);
  });

  it("summarizes project state, completed tasks, open tasks, checkpoints, and actions", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeJson(p.config, {
      name: "Continuity",
      version: "0.10.0",
      createdAt: new Date().toISOString(),
      goal: "Build interactive UI",
    });
    await writeMemory(p.memory.currentState, "# Current state\n\nBuilding interactive UI\n");

    const mcp = makeTask({ title: "MCP server", source: "manual" });
    const publish = makeTask({ title: "npm publish", source: "manual" });
    const wizard = makeTask({ title: "Interactive wizard", source: "unfinished" });
    const hierarchy = makeTask({ title: "Memory hierarchy", source: "docs" });
    await saveCompleted(p, [updateStatus(mcp, "done"), updateStatus(publish, "done")]);
    await saveQueue(p, [wizard, hierarchy]);
    await fs.writeFile(
      p.sessions.log,
      [
        `- [${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}] Built release flow (cp_a1)`,
        `- [${new Date().toISOString()}] Implement dashboard screen (cp_b2)`,
      ].join("\n"),
      "utf8"
    );

    const model = await gatherDashboard(p);
    const out = renderDashboardPlain(model);

    expect(out).toContain("Project: Continuity");
    expect(out).toContain("Current state: Building interactive UI");
    expect(out).toContain("[x] MCP server");
    expect(out).toContain("[x] npm publish");
    expect(out).toContain("[ ] Interactive wizard");
    expect(out).toContain("Next action:");
    expect(out).toContain("Interactive wizard");
    expect(out).toContain("Recent checkpoints:");
    expect(out).toContain("Implement dashboard screen");
    expect(out).toContain("[Wizard] [Next] [Checkpoint] [Handoff] [Resume] [Ask] [Pack]");
  });
});

describe("interactive dashboard rendering", () => {
  it("marks the selected action and keeps navigation cyclic", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const model = await gatherDashboard(p);

    expect(selectedActionIndex(model.actions, 0, 1)).toBe(0);
    expect(selectedActionIndex(model.actions, 0, -1)).toBe(0);
    expect(renderDashboardScreen(model, 0, { columns: 70, rows: 20 })).toContain(">[Wizard]<");
  });

  it("keeps the full project action row visible at a normal terminal width", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeJson(p.config, { name: "Continuity", version: "0.11.0", createdAt: new Date().toISOString() });

    const model = await gatherDashboard(p);
    const screen = renderDashboardScreen(model, 0, { columns: 80, rows: 24 });
    expect(screen).toContain(">[Wizard]< [Next] [Checkpoint] [Handoff] [Resume] [Ask] [Pack]");
  });
});

describe("terminal UI launch gate", () => {
  it("launches only for bare interactive terminals", () => {
    const io = {
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      env: {},
    } as NodeJS.Process;

    expect(shouldLaunchTerminalUi([], io)).toBe(true);
    expect(shouldLaunchTerminalUi(["status"], io)).toBe(false);
    expect(shouldLaunchTerminalUi([], { ...io, env: { CI: "true" } })).toBe(false);
    expect(shouldLaunchTerminalUi([], { ...io, env: { CONTINUITY_NO_TUI: "1" } })).toBe(false);
    expect(shouldLaunchTerminalUi([], { ...io, stdout: { isTTY: false } as NodeJS.WriteStream })).toBe(false);
  });
});
