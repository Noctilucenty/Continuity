import { Paths } from "./paths";
import { AgentTarget } from "../types";
import { readMemory, loadConfig, extractListItems } from "./memory";
import { loadQueue, nextActionable, sortedByPriority } from "./tasks";
import { readLatestCheckpoint } from "./checkpoints";
import { loadEntries } from "./knowledge";
import { writeText } from "../utils/fs";
import { truncate } from "../utils/format";
import { HandoffContext, DecisionBrief } from "../adapters/types";
import { getAdapter, allAdapters } from "../adapters/modelAdapters";

/**
 * The handoff is the payoff: memory + tasks + checkpoints + knowledge all
 * converge into one `HandoffContext` here, and the model adapters
 * (src/adapters) reframe it per target. This module only GATHERS; it no longer
 * decides wording — that lives in the adapters.
 */

export async function buildHandoffContext(p: Paths): Promise<HandoffContext> {
  const [config, memory, queue, cp, entries] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    readLatestCheckpoint(p),
    loadEntries(p),
  ]);

  const decisions: DecisionBrief[] = entries
    .filter((e) => e.type === "decision")
    .slice(-6)
    .map((e) => ({
      title: e.title,
      reason: e.reason,
      alternatives: e.alternatives,
      tradeoffs: e.tradeoffs,
    }));

  const next = nextActionable(queue);
  const topTasks = sortedByPriority(queue)
    .filter((t) => t.status !== "done")
    .slice(0, 5)
    .map((t) => ({ title: t.title, status: t.status, source: t.source, priority: t.priority }));

  // Known bugs: prefer typed bug entries, fall back to the bugs markdown.
  const bugEntries = entries.filter((e) => e.type === "bug").map((e) => e.title);
  const knownBugs = bugEntries.length
    ? dedupe(bugEntries).slice(0, 8)
    : extractListItems(memory.bugs ?? "").slice(0, 8);

  return {
    projectName: config?.name ?? "this project",
    goal: config?.goal,
    visionSummary: firstParagraph(memory.vision),
    stateSummary: firstParagraph(memory.current_state),
    architectureSummary: firstParagraph(memory.architecture),
    latestCheckpointSummary: cp?.summary ?? null,
    latestChanges: cp?.changed ?? [],
    blocker: cp?.blocker,
    nextTask: next
      ? { title: next.title, detail: next.detail, source: next.source, priority: next.priority }
      : undefined,
    topTasks,
    decisions,
    risks: extractListItems(memory.risks ?? "").slice(0, 8),
    knownBugs,
  };
}

export async function generateHandoff(p: Paths, target: AgentTarget): Promise<string> {
  const ctx = await buildHandoffContext(p);
  const doc = getAdapter(target).render(ctx);
  await writeText(p.handoffs[target], doc);
  return doc;
}

/** Regenerate every agent's handoff at once (called from checkpoint). */
export async function generateAllHandoffs(p: Paths): Promise<void> {
  const ctx = await buildHandoffContext(p);
  await Promise.all(
    allAdapters().map((a) => writeText(p.handoffs[a.target], a.render(ctx)))
  );
}

/* ---------- internals ---------- */

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

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
