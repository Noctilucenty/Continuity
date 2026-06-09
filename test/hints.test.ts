import { describe, it, expect } from "vitest";
import { hints } from "../src/utils/hints";

describe("empty-state hints point to the next command", () => {
  it("noTasks -> plan", () => {
    const text = hints.noTasks().join("\n");
    expect(text).toContain("No active tasks");
    expect(text).toContain("continuity plan");
  });

  it("noCheckpoints -> checkpoint --from-git", () => {
    const text = hints.noCheckpoints().join("\n");
    expect(text).toContain("No checkpoints");
    expect(text).toContain("continuity checkpoint --from-git");
  });

  it("noDecisions -> decide", () => {
    const text = hints.noDecisions().join("\n");
    expect(text).toContain("No decisions");
    expect(text).toContain("continuity decide");
  });

  it("noEntities -> entity add", () => {
    const text = hints.noEntities().join("\n");
    expect(text).toContain("No entities");
    expect(text).toContain("continuity entity add");
  });

  it("askNoResult is honest and suggests next steps", () => {
    const text = hints.askNoResult().join("\n");
    expect(text).toContain("could not find a confident answer");
    expect(text).toContain("continuity pack memory");
  });

  it("hints contain no emoji or decorative arrows", () => {
    const all = Object.values(hints)
      .map((fn) => fn().join("\n"))
      .join("\n");
    expect(all).not.toContain("→");
    expect(all).not.toContain("•");
    // no emoji (surrogate pair range)
    expect(all).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
  });
});
