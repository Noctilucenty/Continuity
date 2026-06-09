import { requireProject } from "./_shared";
import { loadConfig, readMemory } from "../core/memory";
import { loadQueue, nextActionable } from "../core/tasks";
import { readLatestCheckpoint } from "../core/checkpoints";
import { logger } from "../utils/logger";
import { truncate } from "../utils/format";
import { copyOrPrint } from "../utils/clipboard";

/**
 * Print the single best prompt to restart work right now. With --raw, print only
 * the prompt (pipe-friendly); with --copy, put it on the clipboard.
 */
export async function resume(opts: { raw?: boolean; copy?: boolean }): Promise<void> {
  const p = await requireProject();
  const [config, memory, queue, cp] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    readLatestCheckpoint(p),
  ]);

  const name = config?.name ?? "this project";
  const task = nextActionable(queue);
  const state = firstLine(memory.current_state);

  const prompt = [
    `You are resuming work on ${name}.`,
    state ? `Current state: ${state}` : "",
    cp ? `Last checkpoint: ${cp.summary}.` : "",
    cp?.blocker ? `Known blocker: ${cp.blocker}.` : "",
    task
      ? `Your next task: ${task.title}.${task.detail && task.detail !== task.title ? ` (${task.detail})` : ""}`
      : `No task is queued — review the project and propose the highest-leverage next task.`,
    `Read .continuity/ for full context. When you stop, run \`continuity checkpoint\`.`,
  ]
    .filter(Boolean)
    .join("\n");

  if (opts.raw) {
    process.stdout.write(prompt + "\n");
    return;
  }

  if (opts.copy) {
    await copyOrPrint(prompt, "resume prompt");
    return;
  }

  logger.heading(`Resume · ${name}`);
  logger.line("```");
  logger.line(prompt);
  logger.line("```");
  logger.line("");
  logger.dim("Tip: `continuity resume --copy` copies the prompt to your clipboard.");
}

function firstLine(md: string | undefined): string {
  if (!md) return "";
  const line = md
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#") && !/^_.*_$/.test(l.trim()));
  return line ? truncate(line, 140) : "";
}
