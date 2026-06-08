import { Paths, memoryFiles } from "../core/paths";
import { loadConfig, readMemory, extractListItems } from "../core/memory";
import { loadQueue, nextActionable, sortedByPriority } from "../core/tasks";
import { listCheckpoints } from "../core/checkpoints";
import { search } from "../core/knowledge";
import { walkFiles } from "../repo/walk";
import { truncate } from "../utils/format";
import { Task } from "../types";

/**
 * Context Packs (v2B #2).
 *
 * The daily pain this solves: you don't want to re-explain your whole project to
 * a fresh AI, and you can't paste everything (token limits). A pack is a focused,
 * deterministic bundle of just the parts of the project that touch one topic —
 * decisions, memories, tasks, checkpoints, files, risks — plus a paste-ready
 * prompt. No embeddings, no external calls: keyword matching only.
 */

export interface PackDecision {
  title: string;
  reason?: string;
  alternatives?: string[];
  tradeoffs?: string;
}

export interface ContextPack {
  topic: string;
  projectName: string;
  projectSummary: string;
  topicSummary: string;
  matched: boolean;
  decisions: PackDecision[];
  memories: { name: string; excerpt: string }[];
  tasks: { title: string; status: string; source: string }[];
  checkpoints: { summary: string; createdAt: string }[];
  files: string[];
  risks: string[];
  nextSteps: string[];
}

const MAX_FILE_MATCHES = 15;

export async function buildPack(p: Paths, topicRaw: string): Promise<ContextPack> {
  const topic = topicRaw.trim();
  const tokens = tokenize(topic);

  const [config, memory, queue, checkpoints, hits] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    listCheckpoints(p),
    search(p, topic),
  ]);

  // Decisions / knowledge that match the topic.
  const decisions: PackDecision[] = hits
    .map((h) => h.entry)
    .filter((e) => e.type === "decision")
    .slice(0, 6)
    .map((e) => ({
      title: e.title,
      reason: e.reason,
      alternatives: e.alternatives,
      tradeoffs: e.tradeoffs,
    }));

  // Memory sections mentioning the topic.
  const memories: { name: string; excerpt: string }[] = [];
  for (const { name } of memoryFiles(p)) {
    const content = memory[name] ?? "";
    const matchingLines = content
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .filter((l) => containsAny(l, tokens));
    if (matchingLines.length) {
      memories.push({ name, excerpt: truncate(matchingLines.join(" "), 300) });
    }
  }

  // Tasks mentioning the topic.
  const matchedTasks = queue
    .filter((t) => containsAny(`${t.title} ${t.detail ?? ""}`, tokens))
    .map((t) => ({ title: t.title, status: t.status, source: t.source }));

  // Checkpoints mentioning the topic.
  const matchedCheckpoints = checkpoints
    .filter((c) => containsAny(c.summary, tokens))
    .slice(-6)
    .reverse()
    .map((c) => ({ summary: c.summary, createdAt: c.createdAt }));

  // Files whose path mentions the topic.
  let files: string[] = [];
  try {
    const walked = await walkFiles(p.cwd);
    files = walked
      .filter((f) => containsAny(f.rel, tokens))
      .map((f) => f.rel)
      .slice(0, MAX_FILE_MATCHES);
  } catch {
    files = [];
  }

  // Risks matching the topic (fall back to all risks if none match).
  const allRisks = extractListItems(memory.risks ?? "");
  const matchedRisks = allRisks.filter((r) => containsAny(r, tokens));
  const risks = matchedRisks.length ? matchedRisks : allRisks.slice(0, 5);

  const matched =
    decisions.length > 0 ||
    memories.length > 0 ||
    matchedTasks.length > 0 ||
    matchedCheckpoints.length > 0 ||
    files.length > 0;

  // Next steps: topic-matched tasks first, then the global next actionable.
  const nextSteps = pickNextSteps(matchedTasks, queue);

  return {
    topic,
    projectName: config?.name ?? "this project",
    projectSummary: firstParagraph(memory.vision) || config?.goal || "No vision recorded yet.",
    topicSummary: matched
      ? `Focused context for "${topic}".`
      : `No topic-specific entries found for "${topic}". Showing general project context instead.`,
    matched,
    decisions,
    memories,
    tasks: matched ? matchedTasks : generalTasks(queue),
    checkpoints: matchedCheckpoints,
    files,
    risks,
    nextSteps,
  };
}

export function renderPack(pack: ContextPack): string {
  const parts: string[] = [
    `# Context Pack: ${pack.topic}`,
    `_Project: ${pack.projectName}_`,
    "",
    "## Project summary",
    pack.projectSummary,
    "",
    "## Topic summary",
    pack.topicSummary,
  ];

  parts.push("", "## Relevant decisions", renderDecisions(pack.decisions));
  parts.push("", "## Relevant memories", renderMemories(pack.memories));
  parts.push("", "## Relevant tasks", renderTasks(pack.tasks));
  parts.push("", "## Relevant checkpoints", renderCheckpoints(pack.checkpoints));
  parts.push("", "## Relevant files", pack.files.length ? bullets(pack.files) : "_none detected_");
  parts.push("", "## Known risks", pack.risks.length ? bullets(pack.risks) : "_none recorded_");
  parts.push("", "## Recommended next steps", pack.nextSteps.length ? bullets(pack.nextSteps) : "_none_");

  parts.push(
    "",
    "## Prompt for an AI assistant",
    "```",
    buildPrompt(pack),
    "```",
    ""
  );

  return parts.join("\n");
}

/* ---------- rendering helpers ---------- */

function renderDecisions(decisions: PackDecision[]): string {
  if (!decisions.length) return "_none found for this topic_";
  return decisions
    .map((d) => {
      const lines = [`- **${d.title}**`];
      if (d.reason) lines.push(`  - Reason: ${d.reason}`);
      if (d.alternatives?.length) lines.push(`  - Alternatives: ${d.alternatives.join("; ")}`);
      if (d.tradeoffs) lines.push(`  - Tradeoffs: ${d.tradeoffs}`);
      return lines.join("\n");
    })
    .join("\n");
}

function renderMemories(memories: { name: string; excerpt: string }[]): string {
  if (!memories.length) return "_none found for this topic_";
  return memories.map((m) => `- **${m.name}**: ${m.excerpt}`).join("\n");
}

function renderTasks(tasks: { title: string; status: string; source: string }[]): string {
  if (!tasks.length) return "_none found for this topic_";
  return tasks.map((t) => `- [${t.status}] ${t.title} (${t.source})`).join("\n");
}

function renderCheckpoints(cps: { summary: string; createdAt: string }[]): string {
  if (!cps.length) return "_none found for this topic_";
  return cps.map((c) => `- ${c.summary} (${c.createdAt})`).join("\n");
}

function buildPrompt(pack: ContextPack): string {
  const lines = [
    `You are helping with "${pack.topic}" in ${pack.projectName}.`,
    pack.projectSummary,
  ];
  if (pack.decisions.length) {
    lines.push(`Relevant decisions: ${pack.decisions.map((d) => d.title).join("; ")}.`);
  }
  if (pack.nextSteps.length) {
    lines.push(`Suggested next steps: ${pack.nextSteps.join("; ")}.`);
  }
  if (!pack.matched) {
    lines.push(`Note: no entries specifically matched "${pack.topic}" yet — use the general context above.`);
  }
  return lines.join("\n");
}

/* ---------- internals ---------- */

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function containsAny(text: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const hay = text.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

function firstParagraph(md: string | undefined): string {
  if (!md) return "";
  const body = md
    .split("\n")
    .filter((l) => !l.startsWith("#") && !/^_.*_$/.test(l.trim()))
    .join("\n")
    .trim();
  return truncate(body.split(/\n\s*\n/)[0]?.trim() ?? "", 400);
}

function pickNextSteps(
  matchedTasks: { title: string }[],
  queue: Task[]
): string[] {
  const steps = matchedTasks.slice(0, 3).map((t) => t.title);
  if (steps.length) return steps;
  const next = nextActionable(queue);
  return next ? [next.title] : [];
}

function generalTasks(queue: Task[]): { title: string; status: string; source: string }[] {
  return sortedByPriority(queue)
    .filter((t) => t.status !== "done")
    .slice(0, 5)
    .map((t) => ({ title: t.title, status: t.status, source: t.source }));
}
