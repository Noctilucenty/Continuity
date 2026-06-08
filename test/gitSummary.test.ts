import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  parsePorcelain,
  parseNameStatus,
  summarizeChanges,
  isGitRepo,
  getWorkingTreeChanges,
} from "../src/git/gitSummary";

const execFileAsync = promisify(execFile);

describe("parsePorcelain", () => {
  it("parses modified, added, deleted, and untracked", () => {
    const out = [" M src/a.ts", "A  src/b.ts", " D src/c.ts", "?? src/new.ts"].join("\n");
    const changes = parsePorcelain(out);
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.status]));
    expect(byPath["src/a.ts"]).toBe("modified");
    expect(byPath["src/b.ts"]).toBe("added");
    expect(byPath["src/c.ts"]).toBe("deleted");
    expect(byPath["src/new.ts"]).toBe("untracked");
  });

  it("records the new path for renames", () => {
    const changes = parsePorcelain("R  old.ts -> new.ts");
    expect(changes[0].path).toBe("new.ts");
    expect(changes[0].status).toBe("renamed");
  });

  it("ignores blank lines and returns empty for clean output", () => {
    expect(parsePorcelain("")).toEqual([]);
    expect(parsePorcelain("\n\n")).toEqual([]);
  });
});

describe("parseNameStatus", () => {
  it("parses a diff --name-status block", () => {
    const out = ["M\tsrc/a.ts", "A\tsrc/b.ts", "D\tsrc/c.ts"].join("\n");
    const changes = parseNameStatus(out);
    expect(changes.map((c) => c.status).sort()).toEqual(["added", "deleted", "modified"]);
  });

  it("handles rename rows (R100 old new)", () => {
    const changes = parseNameStatus("R100\told.ts\tnew.ts");
    expect(changes[0].path).toBe("new.ts");
    expect(changes[0].status).toBe("renamed");
  });
});

describe("summarizeChanges", () => {
  it("counts by status and classifies additions", () => {
    const s = summarizeChanges([
      { path: "a.ts", status: "added" },
      { path: "b.ts", status: "untracked" },
    ]);
    expect(s.counts.added).toBe(1);
    expect(s.counts.untracked).toBe(1);
    expect(s.changeType).toBe("new work / additions");
  });

  it("flags deletions as a risk", () => {
    const s = summarizeChanges([{ path: "gone.ts", status: "deleted" }]);
    expect(s.risks.some((r) => /deleted/i.test(r))).toBe(true);
  });

  it("flags source-without-tests", () => {
    const s = summarizeChanges([{ path: "src/feature.ts", status: "modified" }]);
    expect(s.risks.some((r) => /without any test/i.test(r))).toBe(true);
  });

  it("does not flag source-without-tests when a test changed too", () => {
    const s = summarizeChanges([
      { path: "src/feature.ts", status: "modified" },
      { path: "test/feature.test.ts", status: "modified" },
    ]);
    expect(s.risks.some((r) => /without any test/i.test(r))).toBe(false);
  });

  it("flags lockfile changes", () => {
    const s = summarizeChanges([{ path: "package-lock.json", status: "modified" }]);
    expect(s.risks.some((r) => /lockfile/i.test(r))).toBe(true);
  });

  it("flags a large changeset", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ path: `f${i}.ts`, status: "modified" as const }));
    const s = summarizeChanges(many);
    expect(s.risks.some((r) => /large changeset/i.test(r))).toBe(true);
  });

  it("gives a clean-tree message for no changes", () => {
    const s = summarizeChanges([]);
    expect(s.changeType).toBe("no changes");
    expect(s.suggestedNext).toMatch(/clean/i);
  });
});

// Integration: real temp git repo. Skips gracefully if git is unavailable.
describe("git invocation (temp repo)", () => {
  let dir: string | null = null;
  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = null;
  });

  async function gitAvailable(): Promise<boolean> {
    try {
      await execFileAsync("git", ["--version"]);
      return true;
    } catch {
      return false;
    }
  }

  it("detects a git repo and reads working-tree changes", async () => {
    if (!(await gitAvailable())) return; // skip where git is missing
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-test-"));
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await execFileAsync("git", ["config", "user.email", "t@t.co"], { cwd: dir });
    await execFileAsync("git", ["config", "user.name", "t"], { cwd: dir });

    expect(await isGitRepo(dir)).toBe(true);

    await fs.writeFile(path.join(dir, "new.ts"), "export const x = 1;");
    const changes = await getWorkingTreeChanges(dir);
    expect(changes.map((c) => c.path)).toContain("new.ts");
    expect(changes[0].status).toBe("untracked");
  });

  it("reports a non-git directory as not a repo", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "nogit-test-"));
    expect(await isGitRepo(dir)).toBe(false);
  });
});
