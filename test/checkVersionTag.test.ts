import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";
// The script is CommonJS; import its pure helpers for direct unit testing.
import { checkVersionTag, normalizeTag } from "../scripts/check-version-tag.js";

const root = process.cwd();
const pkgVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version as string;

describe("normalizeTag", () => {
  it("strips a leading v", () => {
    expect(normalizeTag("v0.11.0")).toBe("0.11.0");
    expect(normalizeTag("0.11.0")).toBe("0.11.0");
    expect(normalizeTag("  v1.2.3 ")).toBe("1.2.3");
  });
  it("handles empty/undefined", () => {
    expect(normalizeTag(undefined)).toBe("");
    expect(normalizeTag("")).toBe("");
  });
});

describe("checkVersionTag", () => {
  it("passes when the tag matches (with or without v)", () => {
    expect(checkVersionTag("0.11.0", "v0.11.0").ok).toBe(true);
    expect(checkVersionTag("0.11.0", "0.11.0").ok).toBe(true);
  });
  it("fails on a mismatch with a clear message", () => {
    const r = checkVersionTag("0.11.0", "v0.9.9");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/mismatch/i);
  });
  it("fails when no tag is provided", () => {
    expect(checkVersionTag("0.11.0", "").ok).toBe(false);
  });
});

describe("script CLI behavior (run as a real process)", () => {
  const run = (tag: string) =>
    execFileSync("node", ["scripts/check-version-tag.js", tag], { cwd: root, encoding: "utf8" });

  it("exits 0 when the tag matches the current package version", () => {
    const out = run(`v${pkgVersion}`);
    expect(out).toMatch(/OK/);
  });

  it("exits non-zero when the tag does not match", () => {
    expect(() => run("v0.0.0-definitely-wrong")).toThrow();
  });
});
