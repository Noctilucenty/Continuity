import pc from "picocolors";
import { requireProject } from "./_shared";
import { review as runReview } from "../core/reviewer";
import { generateTasks } from "../core/planner";
import { loadQueue, saveQueue, mergeTasks } from "../core/tasks";
import { loadMetrics, velocity } from "../store/metrics";
import { logger } from "../utils/logger";
import { pluralize } from "../utils/format";

/**
 * The review loop: audit memory + tasks and answer the five questions
 * (improve / risky / test / document / highest-leverage). With --apply, fold the
 * freshly generated tasks into the queue.
 */
export async function review(opts: { apply?: boolean }): Promise<void> {
  const p = await requireProject();
  const r = await runReview(p);

  const section = (label: string, items: string[]) => {
    logger.heading(label);
    for (const item of items) logger.line(`  ${pc.dim("·")} ${item}`);
  };

  logger.heading(pc.bold("Continuity review"));
  section("What needs improvement", r.needsImprovement);
  section("What is risky", r.risky);
  section("What should be tested", r.shouldTest);
  section("What should be documented", r.shouldDocument);

  const v = velocity(await loadMetrics(p));
  section("Momentum", [
    `${v.total} task(s) completed overall; ${v.last7Days} in the last 7 days (~${v.perDay7}/day).`,
    v.last7Days === 0
      ? "No completions this week — close a task with `continuity done` to keep momentum."
      : "Completion velocity is positive — keep checkpointing.",
  ]);

  logger.heading("Highest-leverage next move");
  logger.line(`  ${pc.green("→")} ${r.highestLeverage}`);

  if (opts.apply) {
    const incoming = await generateTasks(p);
    const queue = await loadQueue(p);
    const { merged, added } = mergeTasks(queue, incoming);
    await saveQueue(p, merged);
    logger.line("");
    logger.success(`Applied: ${pluralize(added.length, "new task")} added to the queue.`);
  } else {
    logger.line("");
    logger.dim("Run `continuity review --apply` to turn these into tasks.");
  }
  logger.line("");
}
