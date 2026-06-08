import { describe, it, expect } from "vitest";
import {
  normalizeTarget,
  getAdapter,
  allAdapters,
} from "../src/adapters/modelAdapters";
import { HandoffContext } from "../src/adapters/types";
import { AGENT_TARGETS } from "../src/types";

function ctx(overrides: Partial<HandoffContext> = {}): HandoffContext {
  return {
    projectName: "Scenara",
    goal: "Ship the trader dashboard",
    visionSummary: "A prediction-markets trading app.",
    stateSummary: "Core engine implemented; wiring the odds feed.",
    architectureSummary: "FastAPI backend, React frontend, Polymarket integration.",
    latestCheckpointSummary: "Wired the odds feed",
    latestChanges: ["Added poller", "Removed stub"],
    blocker: "WS reconnect storms under load",
    nextTask: { title: "Add reconnect backoff", detail: "Exponential backoff on the WS client", source: "bug", priority: 90 },
    topTasks: [
      { title: "Add reconnect backoff", status: "in_progress", source: "bug", priority: 90 },
      { title: "Document architecture", status: "todo", source: "docs", priority: 50 },
    ],
    decisions: [
      { title: "Use Polymarket for odds", reason: "Deeper liquidity", alternatives: ["Kalshi"], tradeoffs: "Fewer markets" },
    ],
    risks: ["Rate limits unknown"],
    knownBugs: ["WS reconnect drops"],
    ...overrides,
  };
}

describe("normalizeTarget", () => {
  it("passes through canonical targets", () => {
    for (const t of AGENT_TARGETS) expect(normalizeTarget(t)).toBe(t);
  });
  it("defaults empty/undefined to generic", () => {
    expect(normalizeTarget()).toBe("generic");
    expect(normalizeTarget("")).toBe("generic");
    expect(normalizeTarget("   ")).toBe("generic");
  });
  it("is case-insensitive and trims", () => {
    expect(normalizeTarget("  CLAUDE ")).toBe("claude");
    expect(normalizeTarget("GPT")).toBe("gpt");
  });
  it("maps common aliases", () => {
    expect(normalizeTarget("chatgpt")).toBe("gpt");
    expect(normalizeTarget("openai")).toBe("gpt");
    expect(normalizeTarget("claude-code")).toBe("claude");
    expect(normalizeTarget("anthropic")).toBe("claude");
    expect(normalizeTarget("google")).toBe("gemini");
    expect(normalizeTarget("bard")).toBe("gemini");
  });
  it("returns null for unknown targets (clear-error path)", () => {
    expect(normalizeTarget("grok")).toBeNull();
    expect(normalizeTarget("llama")).toBeNull();
    expect(normalizeTarget("claude-cdoe")).toBeNull(); // typo -> not silently generic
  });
});

describe("every adapter includes the required sections", () => {
  for (const adapter of allAdapters()) {
    it(`${adapter.target}: summary, state, risks/blockers, next action`, () => {
      const out = adapter.render(ctx());
      // project summary content
      expect(out).toContain("prediction-markets");
      // current state
      expect(out.toLowerCase()).toContain("current state");
      // risks/blockers present
      expect(out).toMatch(/Risk|Blocker|blockers/i);
      // next action / task
      expect(out).toContain("Add reconnect backoff");
      // paste-ready continue prompt fenced block
      expect(out).toContain("Prompt to continue");
      expect(out).toContain("Scenara");
    });
  }
});

describe("adapters emphasize target-specific content", () => {
  it("claude stays concise and points at files + next step", () => {
    const out = getAdapter("claude").render(ctx());
    expect(out).toContain("Handoff to Claude Code");
    expect(out).toContain("Relevant files");
    expect(out).toContain("Next step");
  });

  it("gpt surfaces decision reasoning and a recommended direction", () => {
    const out = getAdapter("gpt").render(ctx());
    expect(out).toContain("Why we made key decisions");
    expect(out).toContain("Deeper liquidity"); // decision reason inlined
    expect(out).toContain("Recommended direction");
  });

  it("cursor is implementation-focused: files, test commands, known bugs", () => {
    const out = getAdapter("cursor").render(ctx());
    expect(out).toContain("Files to inspect");
    expect(out).toContain("Test commands");
    expect(out).toContain("npm test");
    expect(out).toContain("Known bugs");
    expect(out).toContain("Exact next coding task");
  });

  it("gemini gives long-form context: overview, architecture, tradeoffs", () => {
    const out = getAdapter("gemini").render(ctx());
    expect(out).toContain("Project overview");
    expect(out).toContain("Architecture overview");
    expect(out).toContain("Polymarket integration"); // architecture inlined
    expect(out).toContain("Decisions and tradeoffs");
  });

  it("generic stays balanced with a task queue", () => {
    const out = getAdapter("generic").render(ctx());
    expect(out).toContain("Task queue");
  });
});

describe("adapters degrade gracefully on empty context", () => {
  const empty: HandoffContext = {
    projectName: "Fresh",
    visionSummary: "",
    stateSummary: "",
    architectureSummary: "",
    latestCheckpointSummary: null,
    latestChanges: [],
    topTasks: [],
    decisions: [],
    risks: [],
    knownBugs: [],
  };
  for (const adapter of allAdapters()) {
    it(`${adapter.target}: no crash, names the project, prompts to plan`, () => {
      const out = adapter.render(empty);
      expect(out).toContain("Fresh");
      expect(out).toContain("continuity plan");
      expect(out).toMatch(/None recorded|none recorded/);
    });
  }
});
