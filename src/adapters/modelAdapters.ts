import { AgentTarget, AGENT_TARGETS } from "../types";
import { HandoffContext, ModelAdapter } from "./types";

/**
 * The five model adapters plus target normalization.
 *
 * Shared section builders below keep wording consistent where it should be;
 * each adapter composes them in its own order with its own emphasis so the
 * output genuinely suits the target tool (concise for Claude, reasoning-heavy
 * for GPT, implementation-focused for Cursor, long-form for Gemini).
 */

/* ---------- shared section builders ---------- */

function bullets(items: string[], empty = "_none recorded_"): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : empty;
}

function section(heading: string, body: string): string {
  return `## ${heading}\n${body}`;
}

function projectSummary(ctx: HandoffContext): string {
  const parts = [ctx.visionSummary || ctx.goal || "No vision recorded yet."];
  if (ctx.goal && ctx.visionSummary) parts.push(`Goal: ${ctx.goal}`);
  return parts.join("\n");
}

function currentState(ctx: HandoffContext): string {
  const lines = [ctx.stateSummary || "No current state recorded."];
  lines.push(
    ctx.latestCheckpointSummary
      ? `Last checkpoint: ${ctx.latestCheckpointSummary}`
      : "No checkpoints yet."
  );
  return lines.join("\n");
}

function risksAndBlockers(ctx: HandoffContext): string {
  const lines: string[] = [];
  if (ctx.blocker) lines.push(`Blocker: ${ctx.blocker}`);
  for (const r of ctx.risks) lines.push(`Risk: ${r}`);
  for (const b of ctx.knownBugs) lines.push(`Bug: ${b}`);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "None recorded.";
}

function nextTask(ctx: HandoffContext): string {
  if (!ctx.nextTask) {
    return 'No task queued. Run `continuity plan "<goal>"` to generate one.';
  }
  const t = ctx.nextTask;
  const head = `${t.title} (${t.source}, priority ${t.priority})`;
  return t.detail && t.detail !== t.title ? `${head}\n${t.detail}` : head;
}

function decisionsWithReasoning(ctx: HandoffContext): string {
  if (!ctx.decisions.length) return "_none recorded_";
  return ctx.decisions
    .map((d) => {
      const lines = [`- **${d.title}**`];
      if (d.reason) lines.push(`  - Reason: ${d.reason}`);
      if (d.alternatives?.length) lines.push(`  - Alternatives: ${d.alternatives.join("; ")}`);
      if (d.tradeoffs) lines.push(`  - Tradeoffs: ${d.tradeoffs}`);
      return lines.join("\n");
    })
    .join("\n");
}

function recentChanges(ctx: HandoffContext): string {
  return bullets(ctx.latestChanges, "_none recorded_");
}

function queue(ctx: HandoffContext): string {
  if (!ctx.topTasks.length) return "_(empty)_";
  return ctx.topTasks
    .map((t) => `- [${t.status}] ${t.title} (${t.source}, p${t.priority})`)
    .join("\n");
}

const FILES_TO_INSPECT = [
  "`.continuity/memory/` — vision, architecture, current_state, decisions, bugs, risks",
  "`.continuity/tasks/task_queue.json` — the scored task graph",
  "`.continuity/sessions/checkpoints/` — what happened, most recent last",
  "`.continuity/knowledge/` — typed decisions/lessons + searchable index",
];

const TEST_COMMANDS = [
  "`npm run typecheck` — type errors",
  "`npm run build` — compile",
  "`npm test` — run the test suite",
];

function header(title: string, ctx: HandoffContext): string {
  return `# ${title}\n_Project: ${ctx.projectName}_`;
}

function continueFenced(prompt: string): string {
  return ["## Prompt to continue", "```", prompt, "```", ""].join("\n");
}

function nextTaskTitle(ctx: HandoffContext): string {
  return ctx.nextTask ? ctx.nextTask.title : "review the project and propose the next task";
}

/* ---------- the adapters ---------- */

const claude: ModelAdapter = {
  target: "claude",
  title: "Handoff to Claude Code",
  optimizesFor: "concise state, current task, constraints, relevant files, next step",
  render(ctx) {
    return [
      header(this.title, ctx),
      "",
      section("Project summary", projectSummary(ctx)),
      "",
      section("Current state", currentState(ctx)),
      "",
      section("Current task", nextTask(ctx)),
      "",
      section("Risks & blockers", risksAndBlockers(ctx)),
      "",
      section("Relevant files", bullets(FILES_TO_INSPECT)),
      "",
      section("Next step", `Start the current task above. When you stop, run \`continuity checkpoint\`.`),
      "",
      continueFenced(
        `You are resuming ${ctx.projectName}. Next task: ${nextTaskTitle(ctx)}. ` +
          `Read .continuity/handoffs/claude.md and the files it lists, then continue. ` +
          `Keep changes focused; run \`continuity checkpoint\` before you stop.`
      ),
    ].join("\n");
  },
};

const gpt: ModelAdapter = {
  target: "gpt",
  title: "Handoff to GPT",
  optimizesFor: "broader context, decision reasoning, risks, options, recommended direction",
  render(ctx) {
    return [
      header(this.title, ctx),
      "",
      section("Project summary", projectSummary(ctx)),
      "",
      section("Current state", currentState(ctx)),
      "",
      section("Recent changes", recentChanges(ctx)),
      "",
      section("Why we made key decisions", decisionsWithReasoning(ctx)),
      "",
      section("Risks & blockers", risksAndBlockers(ctx)),
      "",
      section("Recommended direction", nextTask(ctx)),
      "",
      continueFenced(
        `You are advising on ${ctx.projectName}. Use the project summary, current state, ` +
          `decision reasoning, and risks above as your full context. Recommended next task: ` +
          `${nextTaskTitle(ctx)}. Reason about options before proposing changes.`
      ),
    ].join("\n");
  },
};

const cursor: ModelAdapter = {
  target: "cursor",
  title: "Handoff to Cursor",
  optimizesFor: "codebase structure, files to inspect, implementation steps, test commands, known bugs",
  render(ctx) {
    return [
      header(this.title, ctx),
      "",
      section("Project summary", projectSummary(ctx)),
      "",
      section("Files to inspect", bullets(FILES_TO_INSPECT)),
      "",
      section("Current state", currentState(ctx)),
      "",
      section("Implementation instructions", nextTask(ctx)),
      "",
      section("Test commands", bullets(TEST_COMMANDS)),
      "",
      section("Known bugs", bullets(ctx.knownBugs, "None recorded.")),
      "",
      section("Risks & blockers", risksAndBlockers(ctx)),
      "",
      section("Exact next coding task", nextTaskTitle(ctx)),
      "",
      continueFenced(
        `You are implementing in ${ctx.projectName}. Inspect the files above, then implement: ` +
          `${nextTaskTitle(ctx)}. Run the test commands to verify, then run \`continuity checkpoint\`.`
      ),
    ].join("\n");
  },
};

const gemini: ModelAdapter = {
  target: "gemini",
  title: "Handoff to Gemini",
  optimizesFor: "large context, research-style summary, architecture, decisions and tradeoffs",
  render(ctx) {
    const overview = [
      ctx.visionSummary || ctx.goal || "No vision recorded yet.",
      ctx.goal ? `Goal: ${ctx.goal}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return [
      header(this.title, ctx),
      "",
      section("Project overview", overview),
      "",
      section("Architecture overview", ctx.architectureSummary || "_not recorded_"),
      "",
      section("Decisions and tradeoffs", decisionsWithReasoning(ctx)),
      "",
      section("Current state and recent changes", `${currentState(ctx)}\n\nRecent changes:\n${recentChanges(ctx)}`),
      "",
      section("Risks, blockers & open questions", risksAndBlockers(ctx)),
      "",
      section("Next direction", nextTask(ctx)),
      "",
      continueFenced(
        `You are picking up ${ctx.projectName} with full context. Read the overview, architecture, ` +
          `and decisions above. Next direction: ${nextTaskTitle(ctx)}. ` +
          `Build a complete understanding before acting.`
      ),
    ].join("\n");
  },
};

const generic: ModelAdapter = {
  target: "generic",
  title: "Handoff to AI agent",
  optimizesFor: "balanced, simple, paste-anywhere context",
  render(ctx) {
    return [
      header(this.title, ctx),
      "",
      section("Project summary", projectSummary(ctx)),
      "",
      section("Current state", currentState(ctx)),
      "",
      section("Recent changes", recentChanges(ctx)),
      "",
      section("Next task", nextTask(ctx)),
      "",
      section("Task queue (top 5)", queue(ctx)),
      "",
      section("Risks & blockers", risksAndBlockers(ctx)),
      "",
      continueFenced(
        `You are resuming ${ctx.projectName}. Next task: ${nextTaskTitle(ctx)}. ` +
          `Use the summary, state, and risks above as your context, then continue.`
      ),
    ].join("\n");
  },
};

const ADAPTERS: Record<AgentTarget, ModelAdapter> = {
  claude,
  gpt,
  cursor,
  gemini,
  generic,
};

/** Common aliases people actually type, mapped to canonical targets. */
const ALIASES: Record<string, AgentTarget> = {
  "claude-code": "claude",
  claudecode: "claude",
  anthropic: "claude",
  chatgpt: "gpt",
  openai: "gpt",
  "gpt-4": "gpt",
  gpt4: "gpt",
  "gpt-5": "gpt",
  o1: "gpt",
  google: "gemini",
  bard: "gemini",
  default: "generic",
  any: "generic",
  other: "generic",
};

/**
 * Normalize a user-supplied target. Returns the canonical `AgentTarget`, or
 * `null` for an unrecognized target so the caller can show a clear error
 * (chosen over silently falling back to generic — a silent fallback would hand
 * someone a generic doc when they explicitly asked for "claude-cdoe" typo'd).
 * An empty/undefined input is treated as the default `generic`.
 */
export function normalizeTarget(input?: string): AgentTarget | null {
  const raw = (input ?? "generic").trim().toLowerCase();
  if (raw === "") return "generic";
  if ((AGENT_TARGETS as string[]).includes(raw)) return raw as AgentTarget;
  return ALIASES[raw] ?? null;
}

export function getAdapter(target: AgentTarget): ModelAdapter {
  return ADAPTERS[target];
}

export function allAdapters(): ModelAdapter[] {
  return AGENT_TARGETS.map((t) => ADAPTERS[t]);
}
