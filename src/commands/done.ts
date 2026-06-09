import { requireProject } from "./_shared";
import { completeTask } from "../core/tasks";
import { recordCompletion } from "../store/metrics";
import { logger } from "../utils/logger";
import { truncate } from "../utils/format";

/**
 * `continuity done [taskId]` — mark a task complete. Defaults to the current
 * next-actionable task. Moves it into completed_tasks.json (via completeTask)
 * and records a completion event for velocity metrics.
 */
export async function done(taskId: string | undefined): Promise<void> {
  const p = await requireProject();
  const result = await completeTask(p, taskId);

  if (!result) {
    if (taskId) logger.warn(`No task matches "${taskId}".`);
    else logger.info("No actionable task to complete.");
    return;
  }

  await recordCompletion(p);

  logger.success(`Completed: ${truncate(result.completed.title, 80)}`);
  if (result.next) {
    logger.heading("Next best task");
    logger.line(`  -> ${result.next.title}`);
    logger.dim("  Start it with: continuity next");
  } else {
    logger.line("");
    logger.info('Queue is clear. Run `continuity plan "<goal>"` or `continuity review` for more.');
  }
}
