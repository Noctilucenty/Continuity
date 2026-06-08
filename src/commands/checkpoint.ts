import { requireProject } from "./_shared";
import { appendSection } from "../core/memory";
import { makeCheckpoint, writeCheckpoint } from "../core/checkpoints";
import { generateTasks } from "../core/planner";
import { loadQueue, saveQueue, mergeTasks, nextActionable } from "../core/tasks";
import { addEntry } from "../core/knowledge";
import { generateAllHandoffs } from "../core/handoffs";
import { ask, askMultiline } from "../utils/prompt";
import { logger } from "../utils/logger";
import { relativePath, pluralize } from "../utils/format";
import { EntryType } from "../types";

interface CheckpointOpts {
  summary?: string;
  changed?: string[];
  files?: string[];
  worked?: string[];
  failed?: string[];
  blocker?: string;
  next?: string;
  decision?: string[];
  lesson?: string[];
  bug?: string[];
}

/**
 * The heartbeat. Records what changed, updates memory, captures typed knowledge
 * (decisions/lessons/bugs) into the 2A store, generates the next tasks, and
 * regenerates every agent's handoff — so stopping here loses nothing.
 *
 * Fully scriptable via flags; falls back to interactive prompts on a TTY.
 */
export async function checkpoint(opts: CheckpointOpts): Promise<void> {
  const p = await requireProject();

  const summary =
    opts.summary ?? (await ask("Summary (one line)", "Checkpoint"));
  const changed = opts.changed ?? (await askMultiline("What changed?"));
  const filesModified = opts.files ?? (await askMultiline("Files modified?"));
  const worked = opts.worked ?? (await askMultiline("What worked?"));
  const failed = opts.failed ?? (await askMultiline("What failed?"));
  const blocker = opts.blocker ?? (await ask("Current blocker", ""));
  const nextAction = opts.next ?? (await ask("Next best action", ""));

  // 1. Update human-readable memory.
  await appendSection(p.memory.currentState, `Checkpoint: ${summary}`, [
    ...changed.map((c) => `Changed: ${c}`),
    ...(blocker ? [`Blocker: ${blocker}`] : []),
  ]);
  if (failed.length) await appendSection(p.memory.bugs, `From checkpoint`, failed);

  // 2. Capture typed knowledge into the 2A store.
  let knowledgeAdded = 0;
  const capture = async (items: string[] | undefined, type: EntryType) => {
    for (const item of items ?? []) {
      const { added } = await addEntry(p, { type, title: item, sourceFile: p.sessions.log });
      if (added) knowledgeAdded++;
    }
  };
  await capture(opts.decision, "decision");
  await capture(opts.lesson, "lesson");
  // Explicit --bug flags win; otherwise failures double as discovered bugs.
  await capture(opts.bug && opts.bug.length ? opts.bug : failed, "bug");

  // 3. Build the suggested prompt for whoever resumes.
  const next = nextAction || "Continue from the next best action in memory.";
  const suggestedPrompt = `Resume ${relativePath(p.cwd)}. Last checkpoint: ${summary}. Next: ${next}.` +
    (blocker ? ` Note the blocker: ${blocker}.` : "");

  // 4. Write the checkpoint record.
  const cp = makeCheckpoint({
    summary,
    changed,
    filesModified,
    worked,
    failed,
    blocker: blocker || undefined,
    nextAction: nextAction || undefined,
    suggestedPrompt,
  });
  const cpFile = await writeCheckpoint(p, cp);

  // 5. Regenerate tasks from the now-updated memory.
  const incoming = await generateTasks(p);
  const queue = await loadQueue(p);
  const { merged, added } = mergeTasks(queue, incoming);
  await saveQueue(p, merged);

  // 6. Regenerate every handoff so any agent can pick up cold.
  await generateAllHandoffs(p);

  // Report.
  logger.success("Continuity checkpoint created.");
  logger.line("Current state saved.");
  if (knowledgeAdded) logger.line(`${pluralize(knowledgeAdded, "knowledge entry", "knowledge entries")} captured.`);
  if (failed.length) logger.line(`${pluralize(failed.length, "issue")} tracked.`);
  logger.line(`${pluralize(added.length, "next action")} generated.`);

  const top = nextActionable(merged);
  if (top) {
    logger.heading("Next best task");
    logger.line(`  → ${top.title}`);
  }
  logger.line("");
  logger.info(`Checkpoint saved to ${relativePath(cpFile)}`);
  logger.info(`Handoffs refreshed in ${relativePath(p.handoffs.dir)}/`);
}
