import { describe, it, expect, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  analyzeRepo,
  findTodos,
  isTestFile,
  isSourceFile,
  baseName,
  isLarge,
  LARGE_FILE_BYTES,
} from "../src/repo/analyzer";

let dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((d) => fs.rm(d, { recursive: true, force: true })));
  dirs = [];
});

async function fixture(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-test-"));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
  }
  return dir;
}

describe("pure helpers", () => {
  it("findTodos detects TODO/FIXME/HACK with line numbers", () => {
    const text = "line1\n// TODO: wire it up\ncode\n/* FIXME broken */\n# HACK around bug";
    const hits = findTodos(text, "a.ts");
    expect(hits.map((h) => h.marker)).toEqual(["TODO", "FIXME", "HACK"]);
    expect(hits[0].line).toBe(2);
    expect(hits[0].text).toContain("wire it up");
  });

  it("isTestFile recognizes common test conventions", () => {
    expect(isTestFile("test/foo.test.ts")).toBe(true);
    expect(isTestFile("src/foo.spec.ts")).toBe(true);
    expect(isTestFile("src/__tests__/foo.ts")).toBe(true);
    expect(isTestFile("src/foo.ts")).toBe(false);
  });

  it("isSourceFile excludes tests and declarations", () => {
    expect(isSourceFile({ abs: "", rel: "src/a.ts", size: 1, ext: ".ts" })).toBe(true);
    expect(isSourceFile({ abs: "", rel: "src/a.test.ts", size: 1, ext: ".ts" })).toBe(false);
    expect(isSourceFile({ abs: "", rel: "src/a.d.ts", size: 1, ext: ".ts" })).toBe(false);
    expect(isSourceFile({ abs: "", rel: "img.png", size: 1, ext: ".png" })).toBe(false);
  });

  it("baseName pairs source and test files", () => {
    expect(baseName("src/core/tasks.ts")).toBe("tasks");
    expect(baseName("test/tasks.test.ts")).toBe("tasks");
    expect(baseName("src/tasks.spec.tsx")).toBe("tasks");
  });

  it("isLarge respects the threshold", () => {
    expect(isLarge(LARGE_FILE_BYTES + 1)).toBe(true);
    expect(isLarge(10)).toBe(false);
  });
});

describe("analyzeRepo", () => {
  it("ignores node_modules, .git, and dist", async () => {
    const root = await fixture({
      "src/a.ts": "export const a = 1;",
      "node_modules/pkg/index.ts": "// TODO should be ignored",
      ".git/config": "junk",
      "dist/a.js": "compiled",
    });
    const report = await analyzeRepo(root);
    // only src/a.ts counts as source; node_modules/dist excluded entirely
    expect(report.sourceFiles).toBe(1);
    expect(report.todos.length).toBe(0); // the TODO in node_modules was ignored
  });

  it("identifies source files missing tests, and pairs the ones that have them", async () => {
    const root = await fixture({
      "src/withTest.ts": "export const x = 1;",
      "test/withTest.test.ts": "import './x';",
      "src/noTest.ts": "export const y = 2;",
    });
    const report = await analyzeRepo(root);
    expect(report.filesWithoutTests).toContain("src/noTest.ts");
    expect(report.filesWithoutTests).not.toContain("src/withTest.ts");
  });

  it("detects TODO/FIXME comments in source", async () => {
    const root = await fixture({ "src/a.ts": "// FIXME: handle null\nexport const a = 1;" });
    const report = await analyzeRepo(root);
    expect(report.todos.length).toBe(1);
    expect(report.todos[0].marker).toBe("FIXME");
  });

  it("detects large files", async () => {
    const root = await fixture({
      "src/big.ts": "x".repeat(LARGE_FILE_BYTES + 100),
      "src/small.ts": "export const s = 1;",
    });
    const report = await analyzeRepo(root);
    expect(report.largeFiles.map((f) => f.file)).toContain("src/big.ts");
    expect(report.largeFiles.map((f) => f.file)).not.toContain("src/small.ts");
  });

  it("detects a GitHub Actions CI workflow", async () => {
    const withCI = await fixture({
      "src/a.ts": "export const a = 1;",
      ".github/workflows/ci.yml": "name: CI",
    });
    expect((await analyzeRepo(withCI)).hasCI).toBe(true);

    const withoutCI = await fixture({ "src/a.ts": "export const a = 1;" });
    expect((await analyzeRepo(withoutCI)).hasCI).toBe(false);
  });

  it("reads package scripts and flags docs gaps, always returning recommendations", async () => {
    const root = await fixture({
      "src/a.ts": "export const a = 1;",
      "package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest" } }),
    });
    const report = await analyzeRepo(root);
    expect(report.packageScripts).toEqual(["build", "test"]);
    expect(report.docsGaps.some((g) => /README/i.test(g))).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});
