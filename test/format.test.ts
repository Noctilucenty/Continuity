import { describe, it, expect } from "vitest";
import { pluralize, truncate, relativeTime, shortId } from "../src/utils/format";

describe("pluralize", () => {
  it("uses the singular for exactly 1", () => {
    expect(pluralize(1, "task")).toBe("1 task");
  });
  it("appends s for other counts", () => {
    expect(pluralize(0, "task")).toBe("0 tasks");
    expect(pluralize(3, "task")).toBe("3 tasks");
  });
  it("honors an explicit plural", () => {
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
    expect(pluralize(1, "entry", "entries")).toBe("1 entry");
  });
});

describe("truncate", () => {
  it("leaves short strings untouched", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("collapses whitespace and ellipsizes long strings", () => {
    const out = truncate("a very    long   piece of text here", 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("relativeTime", () => {
  it("returns 'just now' for recent times", () => {
    expect(relativeTime(new Date().toISOString())).toBe("just now");
  });
  it("handles minutes and hours", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinAgo)).toBe("5 minutes ago");
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(relativeTime(twoHoursAgo)).toBe("2 hours ago");
  });
  it("degrades gracefully on garbage", () => {
    expect(relativeTime("not-a-date")).toBe("unknown");
  });
});

describe("shortId", () => {
  it("prefixes and stays unique across calls", () => {
    const a = shortId("t");
    const b = shortId("t");
    expect(a.startsWith("t_")).toBe(true);
    expect(a).not.toBe(b);
  });
});
