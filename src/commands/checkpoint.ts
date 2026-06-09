import { requireProject } from "./_shared";
import { createCheckpoint, CheckpointInput } from "../core/checkpointService";
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

  await runAndReport(p, input);
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

/* ---------- reporting ---------- */

async function runAndReport(
  p: import("../core/paths").Paths,
  input: CheckpointInput
): Promise<void> {
  const result = await createCheckpoint(p, input);

  logger.success("Continuity checkpoint created.");
  logger.line(`  ${truncate(result.summary, 80)}`);
  if (result.knowledgeAdded) {
    logger.line(`${pluralize(result.knowledgeAdded, "knowledge entry", "knowledge entries")} captured.`);
  }
  if (result.risks.length) {
    logger.heading("Risks flagged");
    for (const r of result.risks) logger.line(`  ! ${r}`);
  }
  if (result.failuresTracked) logger.line(`${pluralize(result.failuresTracked, "issue")} tracked.`);
  logger.line(`${pluralize(result.tasksGenerated, "next action")} generated.`);

  if (result.nextTaskTitle) {
    logger.heading("Next best task");
    logger.line(`  -> ${result.nextTaskTitle}`);
  }
  logger.line("");
  logger.info(`Checkpoint saved to ${relativePath(result.file)}`);
  logger.info(`Handoffs refreshed in ${relativePath(p.handoffs.dir)}/`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
