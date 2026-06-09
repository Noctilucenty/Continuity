import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import { wizard } from "../src/commands/wizard";
import { loadConfig } from "../src/core/memory";
import { loadQueue } from "../src/core/tasks";
import { pathExists } from "../src/utils/fs";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("wizard", () => {
  it("initializes and plans when given scriptable inputs", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    process.chdir(p.cwd);

    await wizard({ name: "WizardProject", goal: "Build guided onboarding" });

    const config = await loadConfig(p);
    const queue = await loadQueue(p);
    expect(config?.name).toBe("WizardProject");
    expect(config?.goal).toBe("Build guided onboarding");
    expect(queue.some((task) => task.title === "Build guided onboarding")).toBe(true);
  });

  it("can start the next task when requested", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    process.chdir(p.cwd);

    await wizard({ name: "WizardProject", goal: "Build guided onboarding", start: true });

    const queue = await loadQueue(p);
    expect(queue.some((task) => task.title === "Build guided onboarding" && task.status === "in_progress")).toBe(true);
  });

  it("does not create config in non-tty mode without a project name", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    process.chdir(p.cwd);

    await wizard({});

    expect(await pathExists(p.config)).toBe(false);
    await expect(fs.readdir(p.memory.dir)).resolves.toEqual([]);
  });
});
