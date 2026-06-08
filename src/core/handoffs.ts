import { Paths } from "./paths";
import { AgentTarget, AGENT_TARGETS, Task, ProjectConfig } from "../types";
import { readMemory } from "./memory";
import { loadQueue, nextActionable, sortedByPriority } from "./tasks";
import { loadConfig } from "./memory";
import { readLatestCheckpoint } from "./checkpoints";
import { loadEntries } from "./knowledge";
import { writeText } from "../utils/fs";
import { truncate } from "../utils/format";

/**
 * The handoff is the payoff: memory + tasks + checkpoints + knowledge all
 * converge here and get reframed per agent. The same facts, told the way each
 * tool needs to hear them:
 *
 *   - Claude Code / Cursor have file access -> tell them which files to read.
 *   - GPT / Gemini usually don't -> inline the state they need.
 *
 * That single difference is what makes a handoff work cold, with zero context.
 */

interface HandoffContext {
  config: ProjectConfig | null;
  memory: Record<string, string>;
  queue: Task[];
  next: Task | undefined;
  recentDecisions: string[];
  latestSummary: string | null;
  latestChanges: string[];
}

async function gather(p: Paths): Promise<HandoffContext> {
  const [config, memory, queue, cp, entries] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    readLatestCheckpoint(p),
    loadEntries(p),
  ]);

  const recentDecisions = entries
    .filter((e) => e.type === "decision")
    .slice(-5)
    .map((e) => e.title);

  return {
    config,
    memory,
    queue,
    next: nextActionable(queue),
    recentDecisions,
    latestSummary: cp?.summary ?? null,
    latestChanges: cp?.changed ?? [],
  };
}

export async function generateHandoff(
  p: Paths,
  target: AgentTarget
): Promise<string> {
  const ctx = await gather(p);
  const doc = render(target, ctx);
  await writeText(p.handoffs[target], doc);
  return doc;
}

/** Regenerate every agent's handoff at once (called from checkpoint). */
export async function generateAllHandoffs(p: Paths): Promise<void> {
  const ctx = await gather(p);
  await Promise.all(
    AGENT_TARGETS.map((t) => writeText(p.handoffs[t], render(t, ctx)))
  );
}

/* ---------- rendering ---------- */

function projectName(ctx: HandoffContext): string {
  return ctx.config?.name ?? "this project";
}

function summaryBlock(ctx: HandoffContext): string {
  const vision = firstParagraph(ctx.memory.vision) || ctx.config?.goal || "No vision recorded yet.";
  return vision;
}

function statusBlock(ctx: HandoffContext): string {
  const state = firstParagraph(ctx.memory.current_state) || "No current state recorded.";
  const cp = ctx.latestSummary ? `Last checkpoint: ${ctx.latestSummary}` : "No checkpoints yet.";
  return `${state}\n${cp}`;
}

function nextTaskBlock(ctx: HandoffContext): string {
  if (!ctx.next) return "No task queued. Run `continuity plan \"<goal>\"` to generate one.";
  const lines = [`**${ctx.next.title}** (${ctx.next.source}, priority ${ctx.next.priority})`];
  if (ctx.next.detail) lines.push(ctx.next.detail);
  return lines.join("\n");
}

function constraintsBlock(ctx: HandoffContext): string {
  const lines = [
    "Continuity owns the memory, tasks, decisions, and handoffs — keep it updated.",
    "Run `continuity checkpoint` before you stop, so the next agent can resume.",
  ];
  if (ctx.recentDecisions.length) {
    lines.push("Respect prior decisions (see Recent decisions) unless explicitly revisiting them.");
  }
  return lines.map((l) => `- ${l}`).join("\n");
}

function filesBlock(): string {
  return [
    "`.continuity/memory/` — vision, architecture, current_state, decisions, bugs, risks",
    "`.continuity/tasks/task_queue.json` — the scored task graph",
    "`.continuity/sessions/checkpoints/` — what happened, most recent last",
    "`.continuity/knowledge/` — typed decisions/lessons + searchable index",
  ]
    .map((l) => `- ${l}`)
    .join("\n");
}

function queuePreview(ctx: HandoffContext): string {
  const top = sortedByPriority(ctx.queue).slice(0, 5);
  if (top.length === 0) return "_(empty)_";
  return top.map((t) => `- [${t.status}] ${t.title} (${t.source}, p${t.priority})`).join("\n");
}

function continuePrompt(target: AgentTarget, ctx: HandoffContext): string {
  const name = projectName(ctx);
  const task = ctx.next ? ctx.next.title : "review the project and propose the next task";
  const base = `You are resuming work on ${name}. The next task is: ${task}.`;

  switch (target) {
    case "claude":
    case "cursor":
      return `${base}\nRead .continuity/handoffs/${target}.md and the files it lists, then continue. When you stop, run \`continuity checkpoint\`.`;
    default:
      return `${base}\nUse the project summary, status, recent changes, and constraints in this handoff as your full context, then continue.`;
  }
}

function render(target: AgentTarget, ctx: HandoffContext): string {
  const name = projectName(ctx);
  const hasFiles = target === "claude" || target === "cursor";
  const title = {
    claude: "Handoff → Claude Code",
    cursor: "Handoff → Cursor",
    gpt: "Handoff → GPT",
    gemini: "Handoff → Gemini",
    generic: "Handoff → AI agent",
  }[target];

  const parts: string[] = [
    `# ${title}`,
    `_Project: ${name}_`,
    "",
    "## Project summary",
    summaryBlock(ctx),
    "",
    "## Current status",
    statusBlock(ctx),
    "",
    "## Recent changes",
    ctx.latestChanges.length ? ctx.latestChanges.map((c) => `- ${c}`).join("\n") : "_none recorded_",
    "",
    "## Exact next task",
    nextTaskBlock(ctx),
    "",
    "## Task queue (top 5)",
    queuePreview(ctx),
    "",
    "## Constraints",
    constraintsBlock(ctx),
  ];

  if (ctx.recentDecisions.length) {
    parts.push("", "## Recent decisions", ctx.recentDecisions.map((d) => `- ${d}`).join("\n"));
  }

  if (hasFiles) {
    parts.push("", "## Files to inspect", filesBlock());
  } else {
    // No file access: inline the architecture so the agent has it in-context.
    const arch = firstParagraph(ctx.memory.architecture);
    parts.push("", "## Architecture (inlined)", arch || "_not recorded_");
  }

  parts.push(
    "",
    "## Prompt to continue",
    "```",
    continuePrompt(target, ctx),
    "```",
    ""
  );

  return parts.join("\n");
}

function firstParagraph(md: string | undefined): string {
  if (!md) return "";
  const body = md
    .split("\n")
    .filter((l) => !l.startsWith("#") && !/^_.*_$/.test(l.trim()))
    .join("\n")
    .trim();
  const para = body.split(/\n\s*\n/)[0]?.trim() ?? "";
  return truncate(para, 600);
}
