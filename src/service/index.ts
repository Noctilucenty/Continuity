import { Paths } from "../core/paths";
import { isInitialized } from "../core/memory";
import { buildResumePrompt } from "../core/resumeService";
import { createCheckpoint, CheckpointInput } from "../core/checkpointService";
import { generateHandoff } from "../core/handoffs";
import { loadEntries, search } from "../core/knowledge";
import { loadQueue, nextActionable, updateStatus, saveQueue, completeTask as completeTaskCore } from "../core/tasks";
import { askQuestion } from "../search/ask";
import { recordCompletion } from "../store/metrics";
import { gatherHome } from "../commands/home";
import { normalizeTarget } from "../adapters/modelAdapters";
import { AGENT_TARGETS } from "../types";

/**
 * The service layer (v0.8).
 *
 * Console-free, plain-text functions that wrap Continuity's core for non-CLI
 * callers — specifically the MCP server. Every function tolerates an
 * uninitialized project by returning guidance text instead of throwing, so an
 * agent tool call never crashes.
 */

async function guardInit(p: Paths): Promise<string | null> {
  if (await isInitialized(p)) return null;
  return `No Continuity project here (${p.cwd}). Run \`continuity init\` first, then retry.`;
}

export async function resumeBrief(p: Paths): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const prompt = await buildResumePrompt(p);
  const recentDecisions = (await loadEntries(p))
    .filter((e) => e.type === "decision")
    .slice(-5)
    .map((e) => `- ${e.title}${e.reason ? ` (${e.reason})` : ""}`);

  return recentDecisions.length
    ? `${prompt}\n\nRecent decisions (do not re-litigate):\n${recentDecisions.join("\n")}`
    : prompt;
}

export interface CheckpointArgs {
  summary: string;
  changed?: string[];
  files?: string[];
  decisions?: string[];
  failures?: string[];
  next?: string;
  blocker?: string;
}

export async function recordCheckpoint(p: Paths, args: CheckpointArgs): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const failures = args.failures ?? [];
  const input: CheckpointInput = {
    summary: args.summary,
    changed: args.changed ?? [],
    filesModified: args.files ?? [],
    worked: [],
    failed: failures,
    blocker: args.blocker || undefined,
    nextAction: args.next || undefined,
    decisions: args.decisions ?? [],
    lessons: [],
    bugs: failures, // failures double as discovered bugs, matching the CLI
    extraRisks: [],
  };

  const r = await createCheckpoint(p, input);
  const lines = [
    `Checkpoint saved: ${r.summary}`,
    `${r.knowledgeAdded} knowledge entr${r.knowledgeAdded === 1 ? "y" : "ies"} captured, ${r.tasksGenerated} task(s) generated.`,
  ];
  if (r.failuresTracked) lines.push(`${r.failuresTracked} failure(s) tracked.`);
  if (r.nextTaskTitle) lines.push(`Next best task: ${r.nextTaskTitle}`);
  return lines.join("\n");
}

export async function statusSummary(p: Paths): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const m = await gatherHome(p);
  const lines = [
    `Project: ${m.projectName ?? "(unnamed)"}`,
    m.state ? `State: ${m.state}` : "",
    `Tasks: ${m.activeTasks} active, ${m.doneTasks} done`,
    `Checkpoints: ${m.checkpoints} saved${m.lastCheckpoint ? ` (last ${m.lastCheckpoint})` : ""}`,
    `Next action: ${m.nextCommand}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function handoffDoc(p: Paths, to: string | undefined): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const target = normalizeTarget(to);
  if (!target) {
    return `Unknown agent "${to}". Choose one of: ${AGENT_TARGETS.join(", ")}.`;
  }
  return generateHandoff(p, target);
}

export async function nextTaskText(p: Paths): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const task = nextActionable(await loadQueue(p));
  if (!task) return 'No actionable task. Use the plan tool or run `continuity plan "<goal>"`.';
  return `Next task: ${task.title}\nsource: ${task.source} · priority: ${task.priority} · status: ${task.status}${
    task.detail && task.detail !== task.title ? `\ndetail: ${task.detail}` : ""
  }`;
}

export async function startNextTask(p: Paths): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const queue = await loadQueue(p);
  const task = nextActionable(queue);
  if (!task) return 'No actionable task. Use the plan tool or run `continuity plan "<goal>"`.';
  if (task.status === "todo") {
    const updated = updateStatus(task, "in_progress");
    await saveQueue(p, queue.map((t) => (t.id === task.id ? updated : t)));
  }
  return `Started: ${task.title}`;
}

export async function completeTaskText(p: Paths, taskId?: string): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const result = await completeTaskCore(p, taskId);
  if (!result) return taskId ? `No task matches "${taskId}".` : "No actionable task to complete.";
  await recordCompletion(p);
  return result.next
    ? `Completed: ${result.completed.title}\nNext: ${result.next.title}`
    : `Completed: ${result.completed.title}\nQueue is clear.`;
}

export async function answerText(p: Paths, question: string): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const result = await askQuestion(p, question);
  if (!result.found) {
    return `No confident answer in stored memory for: ${result.question}\nRecord context with checkpoint/decide tools, then retry.`;
  }
  const lines = [`Q: ${result.question}`];
  if (result.bestDecision) {
    const d = result.bestDecision;
    lines.push(`Decision: ${d.title}`);
    if (d.reason) lines.push(`Reason: ${d.reason}`);
    if (d.alternatives?.length) lines.push(`Alternatives: ${d.alternatives.join("; ")}`);
    if (d.tradeoffs) lines.push(`Tradeoffs: ${d.tradeoffs}`);
  }
  lines.push("Sources: " + result.sources.map((s) => `[${s.type}] ${s.label}`).join("; "));
  lines.push(`Confidence: ${result.confidence}`);
  return lines.join("\n");
}

export async function recallText(p: Paths, query: string): Promise<string> {
  const guard = await guardInit(p);
  if (guard) return guard;

  const hits = await search(p, query);
  if (hits.length === 0) return `No matches for "${query}".`;
  return hits
    .slice(0, 8)
    .map((h) => `[${h.entry.type}] ${h.entry.title}${h.entry.reason ? ` — ${h.entry.reason}` : ""}`)
    .join("\n");
}
