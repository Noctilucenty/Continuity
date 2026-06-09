import pc from "picocolors";
import { requireProject } from "./_shared";
import { loadConfig } from "../core/memory";
import { loadQueue, loadCompleted, nextActionable, sortedByPriority } from "../core/tasks";
import { readLatestCheckpoint, checkpointAge } from "../core/checkpoints";
import { loadEntries } from "../core/knowledge";
import { loadMetrics, velocity } from "../store/metrics";
import { hints, printHint } from "../utils/hints";
import { logger } from "../utils/logger";
import { pluralize, truncate } from "../utils/format";

/** The dashboard: one screen that says where the project stands. */
export async function status(): Promise<void> {
  const p = await requireProject();
  const [config, queue, completed, cp, entries, m] = await Promise.all([
    loadConfig(p),
    loadQueue(p),
    loadCompleted(p),
    readLatestCheckpoint(p),
    loadEntries(p),
    loadMetrics(p),
  ]);

  logger.heading(`${config?.name ?? "Project"} · Continuity`);
  if (config?.goal) logger.dim(truncate(config.goal, 100));

  const open = queue.filter((t) => t.status !== "done");
  const inProgress = queue.filter((t) => t.status === "in_progress");
  const blocked = queue.filter((t) => t.status === "blocked");

  logger.line("");
  logger.line(
    `  ${pc.bold("Tasks")}      ${pluralize(open.length, "open task")}` +
      `  ·  ${inProgress.length} in progress` +
      `  ·  ${blocked.length} blocked` +
      `  ·  ${completed.length} done`
  );
  logger.line(`  ${pc.bold("Knowledge")}  ${pluralize(entries.length, "entry", "entries")}`);
  logger.line(`  ${pc.bold("Checkpoint")} ${checkpointAge(cp)}`);

  const v = velocity(m);
  logger.line(
    `  ${pc.bold("Momentum")}   ${v.total} completed` +
      `  ·  ${v.last7Days} in last 7d (~${v.perDay7}/day)` +
      `  ·  ${m.counters.checkpoints} checkpoints`
  );

  const next = nextActionable(queue);
  if (!next && open.length === 0) {
    logger.line("");
    printHint(hints.noTasks());
    if (cp === null) {
      logger.line("");
      printHint(hints.noCheckpoints());
    }
    logger.line("");
    return;
  }

  logger.heading("Next best task");
  if (next) {
    logger.line(`  ${pc.green("->")} ${next.title}`);
    logger.dim(`    ${next.source} · priority ${next.priority} · ${next.status}`);
  } else {
    logger.dim('  Nothing actionable. Run `continuity plan "<goal>"`.');
  }

  const top = sortedByPriority(open).slice(0, 5);
  if (top.length) {
    logger.heading("Queue");
    for (const t of top) {
      const mark = t.status === "in_progress" ? pc.yellow("◐") : pc.dim("○");
      logger.line(`  ${mark} ${truncate(t.title, 70)} ${pc.dim(`p${t.priority}`)}`);
    }
  }

  logger.line("");
}
