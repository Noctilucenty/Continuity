import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

describe("package metadata", () => {
  it("has core identity fields", () => {
    expect(typeof pkg.name).toBe("string");
    expect(pkg.name.length).toBeGreaterThan(0);
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.description.length).toBeGreaterThan(10);
    expect(pkg.license).toBe("MIT");
  });

  it("points the bin and main at the built CLI", () => {
    expect(pkg.bin.continuity).toMatch(/dist\/cli\.js$/);
    expect(pkg.main).toMatch(/cli\.js$/);
  });

  it("keeps the command unscoped even if the package name is scoped", () => {
    // The command users type stays `continuity` regardless of the package scope.
    expect(Object.keys(pkg.bin)).toContain("continuity");
  });

  it("publishes a scoped package publicly", () => {
    if (pkg.name.startsWith("@")) {
      expect(pkg.publishConfig?.access).toBe("public");
    }
  });

  // Publish hardening (release automation).
  it("uses a scoped package name", () => {
    expect(pkg.name.startsWith("@")).toBe(true);
  });

  it("publishConfig.access is public", () => {
    expect(pkg.publishConfig?.access).toBe("public");
  });

  it("bin path does not start with ./ (canonical form npm expects)", () => {
    for (const target of Object.values(pkg.bin) as string[]) {
      expect(target.startsWith("./")).toBe(false);
    }
  });

  it("has a valid semver version", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/);
  });

  it("files allowlist excludes source, tests, and .continuity", () => {
    expect(pkg.files).not.toContain("src");
    expect(pkg.files).not.toContain("test");
    expect(pkg.files).not.toContain(".continuity");
  });

  it("requires Node 20+", () => {
    expect(pkg.engines.node).toContain("20");
  });

  it("links to the repository, homepage, and bugs", () => {
    expect(pkg.repository.url).toContain("github.com/Noctilucenty/Continuity");
    expect(pkg.homepage).toContain("github.com/Noctilucenty/Continuity");
    expect(pkg.bugs.url).toContain("github.com/Noctilucenty/Continuity");
  });

  it("has useful, non-spam keywords", () => {
    for (const kw of ["ai", "cli", "memory", "handoff", "developer-tools"]) {
      expect(pkg.keywords).toContain(kw);
    }
    expect(pkg.keywords.length).toBeLessThanOrEqual(15);
  });

  it("uses a files allowlist that ships dist/docs but not source or tests", () => {
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("docs");
    expect(pkg.files).toContain("README.md");
    expect(pkg.files).toContain("LICENSE");
    expect(pkg.files).not.toContain("src");
    expect(pkg.files).not.toContain("test");
  });

  it("has the right lifecycle scripts and no install-time scripts for consumers", () => {
    expect(pkg.scripts.build).toBe("tsc");
    expect(pkg.scripts.typecheck).toBeTruthy();
    expect(pkg.scripts["pack:check"]).toBeTruthy();
    // prepublishOnly must gate on typecheck + build + test
    expect(pkg.scripts.prepublishOnly).toContain("typecheck");
    expect(pkg.scripts.prepublishOnly).toContain("build");
    expect(pkg.scripts.prepublishOnly).toContain("test");
    // never run code on a consumer's machine at install time
    expect(pkg.scripts.postinstall).toBeUndefined();
  });
});

describe("CLI binary", () => {
  it("the source entry begins with a Node shebang", () => {
    const cli = readFileSync(path.join(root, "src", "cli.ts"), "utf8");
    expect(cli.split("\n")[0]).toBe("#!/usr/bin/env node");
  });
});

describe("npm pack allowlist", () => {
  it("includes the build and docs, excludes tests/source/.continuity", () => {
    // Runs `prepare` (build) so dist exists, then lists the would-be tarball.
    const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    const files: string[] = JSON.parse(out)[0].files.map((f: { path: string }) => f.path);

    // Required
    expect(files).toContain("dist/cli.js");
    expect(files).toContain("README.md");
    expect(files).toContain("LICENSE");
    expect(files).toContain("package.json");
    expect(files.some((f) => f.startsWith("docs/"))).toBe(true);

    // Excluded
    expect(files.some((f) => f.startsWith("test/"))).toBe(false);
    expect(files.some((f) => f.startsWith("src/"))).toBe(false);
    expect(files.some((f) => f.endsWith(".ts"))).toBe(false);
    expect(files.some((f) => f.includes(".continuity"))).toBe(false);
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
  }, 60000);
});
