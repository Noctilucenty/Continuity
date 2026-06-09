import { Paths } from "./paths";
import { loadConfig, readMemory } from "./memory";
import { loadQueue, nextActionable } from "./tasks";
import { readLatestCheckpoint } from "./checkpoints";
import { truncate } from "../utils/format";

/**
 * Builds the "restart work right now" prompt, console-free, so the `resume`
 * command and the MCP `continuity_resume` tool share one implementation.
 */
export async function buildResumePrompt(p: Paths): Promise<string> {
  const [config, memory, queue, cp] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    readLatestCheckpoint(p),
  ]);

  const name = config?.name ?? "this project";
  const task = nextActionable(queue);
  const state = firstLine(memory.current_state);

  return [
    `You are resuming work on ${name}.`,
    state ? `Current state: ${state}` : "",
    cp ? `Last checkpoint: ${cp.summary}.` : "",
    cp?.blocker ? `Known blocker: ${cp.blocker}.` : "",
    task
      ? `Your next task: ${task.title}.${
          task.detail && task.detail !== task.title ? ` (${task.detail})` : ""
        }`
      : "No task is queued — review the project and propose the highest-leverage next task.",
    "Read .continuity/ for full context. When you stop, run `continuity checkpoint`.",
  ]
    .filter(Boolean)
    .join("\n");
}

function firstLine(md: string | undefined): string {
  if (!md) return "";
  const line = md
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#") && !/^_.*_$/.test(l.trim()));
  return line ? truncate(line, 140) : "";
}
