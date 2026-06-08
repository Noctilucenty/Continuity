import pc from "picocolors";
import { requireProject } from "./_shared";
import { loadConfig } from "../core/memory";
import {
  loadQueue,
  saveQueue,
  nextActionable,
  updateStatus,
} from "../core/tasks";
import { logger } from "../utils/logger";

/**
 * Identify and start the single highest-leverage task, then print a paste-ready
 * prompt so any agent can begin immediately. Uses `nextActionable` — the one
 * selection function every command shares — so `next`, `resume`, and `handoff`
 * never disagree.
 */
export async function next(opts: { peek?: boolean }): Promise<void> {
  const p = await requireProject();
  const queue = await loadQueue(p);
  const task = nextActionable(queue);

  if (!task) {
    logger.info("No actionable task. Run `continuity plan \"<goal>\"` to generate one.");
    return;
  }

  if (!opts.peek && task.status === "todo") {
    const updated = updateStatus(task, "in_progress");
    await saveQueue(p, queue.map((t) => (t.id === task.id ? updated : t)));
    task.status = "in_progress";
  }

  const config = await loadConfig(p);
  logger.heading("Next best task");
  logger.line(`  ${pc.green("→")} ${task.title}`);
  logger.dim(`    ${task.source} · priority ${task.priority} · ${task.status}`);
  if (task.detail && task.detail !== task.title) {
    logger.line("");
    logger.dim(`  ${task.detail}`);
  }

  logger.heading("Suggested prompt");
  logger.line("```");
  logger.line(
    `You are working on ${config?.name ?? "this project"}. ` +
      `Your current task: ${task.title}.` +
      (task.detail && task.detail !== task.title ? `\nDetail: ${task.detail}` : "") +
      `\nWhen you finish or stop, run \`continuity checkpoint\` to save state.`
  );
  logger.line("```");
  logger.line("");
}
