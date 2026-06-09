import pc from "picocolors";
import { requireProject } from "./_shared";
import { loadMetrics, velocity } from "../store/metrics";
import { logger } from "../utils/logger";
import { relativeTime } from "../utils/format";

/**
 * `continuity metrics` — show usage signal and task-completion velocity.
 * `--json` for tooling.
 */
export async function metrics(opts: { json?: boolean }): Promise<void> {
  const p = await requireProject();
  const m = await loadMetrics(p);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ...m, velocity: velocity(m) }, null, 2) + "\n");
    return;
  }

  const v = velocity(m);

  logger.heading("Continuity metrics");
  logger.dim(`  tracking since ${relativeTime(m.createdAt)}`);
  logger.line("");
  logger.line(`  ${pc.bold("Activity")}`);
  logger.line(`    checkpoints   ${m.counters.checkpoints}`);
  logger.line(`    handoffs      ${m.counters.handoffs}`);
  logger.line(`    decisions     ${m.counters.decisions}`);
  logger.line(`    asks          ${m.counters.asks}`);
  logger.line(`    packs         ${m.counters.packs}`);

  const targets = Object.entries(m.handoffsByTarget).sort((a, b) => b[1] - a[1]);
  if (targets.length) {
    logger.line("");
    logger.line(`  ${pc.bold("Handoffs by target")}`);
    for (const [target, count] of targets) logger.line(`    ${target.padEnd(12)} ${count}`);
  }

  logger.line("");
  logger.line(`  ${pc.bold("Task velocity")}`);
  logger.line(`    created       ${m.counters.tasksCreated}`);
  logger.line(`    completed     ${v.total}`);
  logger.line(`    last 7 days   ${v.last7Days} (~${v.perDay7}/day)`);
  logger.line("");
}
