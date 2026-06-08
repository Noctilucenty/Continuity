import { requireProject } from "./_shared";
import { appendSection } from "../core/memory";
import { makeCheckpoint, writeCheckpoint } from "../core/checkpoints";
import { generateTasks } from "../core/planner";
import { loadQueue, saveQueue, mergeTasks, nextActionable } from "../core/tasks";
import { addEntry } from "../core/knowledge";
import { generateAllHandoffs } from "../core/handoffs";
import {
  isGitRepo,
  getWorkingTreeChanges,
  getDiffSince,
  summarizeChanges,
  GitChange,
} from "../git/gitSummary";
import { ask, askMultiline } from "../utils/prompt";
import { logger } from "../utils/logger";
import { relativePath, pluralize, truncate } from "../utils/format";
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
  /** Auto-checkpoint from git (v2B #4). */
  fromGit?: boolean;
  since?: string;
}

/** Resolved checkpoint fields, however they were sourced. */
interface CheckpointInput {
  summary: string;
  changed: string[];
  filesModified: string[];
  worked: string[];
  failed: string[];
  blocker?: string;
  nextAction?: string;
  decisions: string[];
  lessons: string[];
  bugs: string[];
  extraRisks: string[];
}

/**
 * The heartbeat. Records what changed, updates memory, captures typed knowledge
 * into the 2A store, regenerates tasks and every handoff — so stopping here
 * loses nothing.
 *
 * Three input modes: explicit flags, interactive prompts (TTY), or derived from
 * git via --from-git / --since (read-only; never commits or rewrites history).
 */
export async function checkpoint(opts: CheckpointOpts): Promise<void> {
  const p = await requireProject();

  const input =
    opts.fromGit || opts.since
      ? await fromGit(opts)
      : await fromFlagsOrPrompts(opts);

  if (!input) return; // git mode produced a graceful message and bailed

  await createCheckpoint(p, input);
}

/* ---------- input acquisition ---------- */

async function fromFlagsOrPrompts(opts: CheckpointOpts): Promise<CheckpointInput> {
  const summary = opts.summary ?? (await ask("Summary (one line)", "Checkpoint"));
  const changed = opts.changed ?? (await askMultiline("What changed?"));
  const filesModified = opts.files ?? (await askMultiline("Files modified?"));
  const worked = opts.worked ?? (await askMultiline("What worked?"));
  const failed = opts.failed ?? (await askMultiline("What failed?"));
  const blocker = opts.blocker ?? (await ask("Current blocker", ""));
  const nextAction = opts.next ?? (await ask("Next best action", ""));

  return {
    summary,
    changed,
    filesModified,
    worked,
    failed,
    blocker: blocker || undefined,
    nextAction: nextAction || undefined,
    decisions: opts.decision ?? [],
    lessons: opts.lesson ?? [],
    bugs: opts.bug && opts.bug.length ? opts.bug : failed,
    extraRisks: [],
  };
}

/**
 * Build checkpoint input from git. Returns null (after a friendly message) for
 * a non-git repo or a clean working tree, so the command exits gracefully.
 */
async function fromGit(opts: CheckpointOpts): Promise<CheckpointInput | null> {
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) {
    logger.warn("Not a git repository — `--from-git`/`--since` need git.");
    logger.dim("Run a normal `continuity checkpoint` instead.");
    return null;
  }

  let changes: GitChange[];
  try {
    changes = opts.since ? await getDiffSince(cwd, opts.since) : await getWorkingTreeChanges(cwd);
  } catch (err) {
    logger.warn(`git failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (changes.length === 0) {
    logger.info(
      opts.since
        ? `No changes since ${opts.since}. Nothing to checkpoint.`
        : "Working tree is clean. Nothing to checkpoint from git."
    );
    return null;
  }

  const sum = summarizeChanges(changes);
  const scope = opts.since ? ` since ${opts.since}` : "";
  const fileCount = pluralize(changes.length, "file");
  const summary = opts.summary ?? `${capitalize(sum.changeType)}${scope} (${fileCount})`;

  return {
    summary,
    changed: [
      `${sum.changeType} (${fileCount})`,
      ...changes.slice(0, 30).map((c) => `${c.status}: ${c.path}`),
    ],
    filesModified: changes.map((c) => c.path),
    worked: opts.worked ?? [],
    failed: opts.failed ?? [],
    blocker: opts.blocker || undefined,
    nextAction: opts.next ?? sum.suggestedNext,
    decisions: opts.decision ?? [],
    lessons: opts.lesson ?? [],
    bugs: opts.bug ?? [],
    extraRisks: sum.risks,
  };
}

/* ---------- checkpoint creation pipeline ---------- */

async function createCheckpoint(
  p: import("../core/paths").Paths,
  input: CheckpointInput
): Promise<void> {
  // 1. Update human-readable memory.
  await appendSection(p.memory.currentState, `Checkpoint: ${input.summary}`, [
    ...input.changed.map((c) => `Changed: ${c}`),
    ...(input.blocker ? [`Blocker: ${input.blocker}`] : []),
  ]);
  if (input.failed.length) await appendSection(p.memory.bugs, "From checkpoint", input.failed);
  if (input.extraRisks.length) await appendSection(p.memory.risks, "From git checkpoint", input.extraRisks);

  // 2. Capture typed knowledge into the 2A store.
  let knowledgeAdded = 0;
  const capture = async (items: string[], type: EntryType) => {
    for (const item of items) {
      const { added } = await addEntry(p, {
        type,
        title: item,
        sourceFile: p.sessions.log,
        source: "checkpoint",
      });
      if (added) knowledgeAdded++;
    }
  };
  await capture(input.decisions, "decision");
  await capture(input.lessons, "lesson");
  // Explicit bugs win; otherwise failures double as discovered bugs.
  await capture(input.bugs, "bug");

  // 3. Build the suggested prompt for whoever resumes.
  const next = input.nextAction || "Continue from the next best action in memory.";
  const suggestedPrompt =
    `Resume ${relativePath(p.cwd)}. Last checkpoint: ${input.summary}. Next: ${next}.` +
    (input.blocker ? ` Note the blocker: ${input.blocker}.` : "");

  // 4. Write the checkpoint record.
  const cp = makeCheckpoint({
    summary: input.summary,
    changed: input.changed,
    filesModified: input.filesModified,
    worked: input.worked,
    failed: input.failed,
    blocker: input.blocker,
    nextAction: input.nextAction,
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
  logger.line(`  ${truncate(input.summary, 80)}`);
  if (knowledgeAdded) {
    logger.line(`${pluralize(knowledgeAdded, "knowledge entry", "knowledge entries")} captured.`);
  }
  if (input.extraRisks.length) {
    logger.heading("Risks flagged");
    for (const r of input.extraRisks) logger.line(`  ! ${r}`);
  }
  if (input.failed.length) logger.line(`${pluralize(input.failed.length, "issue")} tracked.`);
  logger.line(`${pluralize(added.length, "next action")} generated.`);

  const top = nextActionable(merged);
  if (top) {
    logger.heading("Next best task");
    logger.line(`  -> ${top.title}`);
  }
  logger.line("");
  logger.info(`Checkpoint saved to ${relativePath(cpFile)}`);
  logger.info(`Handoffs refreshed in ${relativePath(p.handoffs.dir)}/`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
