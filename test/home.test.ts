import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { gatherHome, renderHome, HomeModel } from "../src/commands/home";
import { onboardingGuide } from "../src/commands/init";
import { paths } from "../src/core/paths";
import { writeJson } from "../src/utils/fs";
import { saveQueue, makeTask } from "../src/core/tasks";
import { tmpProject } from "./helpers";

let dirs: string[] = [];
let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => fs.rm(d, { recursive: true, force: true })));
  await Promise.all(cleanups.map((c) => c()));
  dirs = [];
  cleanups = [];
});

async function bareDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "home-test-"));
  dirs.push(dir);
  return dir;
}

describe("renderHome", () => {
  it("outside a project shows getting-started, no command wall", () => {
    const out = renderHome({ initialized: false, activeTasks: 0, doneTasks: 0, checkpoints: 0, nextCommand: "continuity init" });
    expect(out).toContain("Start here");
    expect(out).toContain("continuity init");
    expect(out).toContain('continuity plan "what you are building"');
    expect(out).toContain("Daily loop");
    expect(out).not.toContain("Project:");
  });

  it("inside a project shows a dashboard and the next action", () => {
    const model: HomeModel = {
      initialized: true,
      projectName: "Scenara",
      state: "Building authentication",
      activeTasks: 12,
      doneTasks: 4,
      checkpoints: 8,
      lastCheckpoint: "2 hours ago",
      nextCommand: "continuity next",
    };
    const out = renderHome(model);
    expect(out).toContain("Project: Scenara");
    expect(out).toContain("Tasks: 12 active, 4 done");
    expect(out).toContain("Checkpoints: 8 saved");
    expect(out).toContain("Next best action:");
    expect(out).toContain("continuity next");
    expect(out).toContain("do the work");
    // no decorative arrows / emoji in the friendly screen
    expect(out).not.toContain("→");
    expect(out).not.toContain("•");
  });
});

describe("gatherHome", () => {
  it("reports not-initialized for a bare directory (and does not crash)", async () => {
    const p = paths(await bareDir());
    const m = await gatherHome(p);
    expect(m.initialized).toBe(false);
    expect(m.nextCommand).toBe("continuity init");
  });

  it("does not crash on a partial .continuity (dirs but no config)", async () => {
    const { p, cleanup } = await tmpProject(); // creates dirs, no config.json
    cleanups.push(cleanup);
    const m = await gatherHome(p);
    expect(m.initialized).toBe(false); // no config -> treated as not initialized
  });

  it("summarizes an initialized project", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeJson(p.config, { name: "Scenara", version: "0.6.0", createdAt: new Date().toISOString() });
    await saveQueue(p, [
      makeTask({ title: "do a thing", source: "bug" }),
      makeTask({ title: "another", source: "docs" }),
    ]);
    const m = await gatherHome(p);
    expect(m.initialized).toBe(true);
    expect(m.projectName).toBe("Scenara");
    expect(m.activeTasks).toBe(2);
    expect(m.nextCommand).toBe("continuity next");
  });
});

describe("onboardingGuide", () => {
  it("tells the user the first commands, including --copy handoff", () => {
    const text = onboardingGuide().join("\n");
    expect(text).toContain("continuity plan");
    expect(text).toContain("continuity next");
    expect(text).toContain("continuity checkpoint --from-git");
    expect(text).toContain("continuity handoff --to claude --copy");
    expect(text).toContain("Tip:");
  });
});
