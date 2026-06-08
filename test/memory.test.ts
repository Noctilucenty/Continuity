import { describe, it, expect } from "vitest";
import { extractListItems } from "../src/core/memory";

describe("extractListItems", () => {
  it("pulls dash, star, and numbered list items", () => {
    const md = "- alpha\n* beta\n1. gamma\n2. delta";
    expect(extractListItems(md)).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("ignores non-list prose and headings", () => {
    const md = "# Heading\nsome prose\n- real item";
    expect(extractListItems(md)).toEqual(["real item"]);
  });

  it("skips italic placeholder lines and (none) markers", () => {
    const md = "- _placeholder text_\n- (none yet)\n- (None)\n- keep me";
    expect(extractListItems(md)).toEqual(["keep me"]);
  });

  it("trims whitespace and drops empties", () => {
    const md = "-   spaced   \n-\n-    \n- ok";
    expect(extractListItems(md)).toEqual(["spaced", "ok"]);
  });
});
