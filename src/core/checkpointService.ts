import { Paths } from "./paths";
import { appendSection } from "./memory";
import { makeCheckpoint, writeCheckpoint } from "./checkpoints";
import { generateTasks } from "./planner";
import { loadQueue, saveQueue, mergeTasks, nextActionable } from "./tasks";
import { addEntry } from "./knowledge";
import { generateAllHandoffs } from "./handoffs";
import { bump } from "../store/metrics";
import { relativePath } from "../utils/format";
import { EntryType } from "../types";

/**
 * The checkpoint creation pipeline, console-free, so both the CLI command and
 * the MCP server share exactly one path. It updates memory, captures typed
 * knowledge, writes the checkpoint, regenerates tasks and handoffs, and bumps
 * metrics — then RETURNS a structured result. Callers do their own reporting.
 */

export interface CheckpointInput {
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

export interface CheckpointResult {
  checkpointId: string;
  file: string;
  summary: string;
  knowledgeAdded: number;
  failuresTracked: number;
  tasksGenerated: number;
  risks: string[];
  nextTaskTitle?: string;
}

export async function createCheckpoint(
  p: Paths,
  input: CheckpointInput
): Promise<CheckpointResult> {
  // 1. Update human-readable memory.
  await appendSection(p.memory.currentState, `Checkpoint: ${input.summary}`, [
    ...input.changed.map((c) => `Changed: ${c}`),
    ...(input.blocker ? [`Blocker: ${input.blocker}`] : []),
  ]);
  if (input.failed.length) await appendSection(p.memory.bugs, "From checkpoint", input.failed);
  if (input.extraRisks.length) {
    await appendSection(p.memory.risks, "From git checkpoint", input.extraRisks);
  }

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

  // 7. Metrics.
  await bump(p, "checkpoints");
  if (added.length) await bump(p, "tasksCreated", added.length);

  return {
    checkpointId: cp.id,
    file: cpFile,
    summary: input.summary,
    knowledgeAdded,
    failuresTracked: input.failed.length,
    tasksGenerated: added.length,
    risks: input.extraRisks,
    nextTaskTitle: nextActionable(merged)?.title,
  };
}
