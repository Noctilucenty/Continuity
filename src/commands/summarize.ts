import { requireProject } from "./_shared";
import { loadConfig, readMemory } from "../core/memory";
import { loadQueue, loadCompleted, nextActionable, sortedByPriority } from "../core/tasks";
import { readLatestCheckpoint, checkpointAge } from "../core/checkpoints";
import { loadEntries } from "../core/knowledge";
import { logger } from "../utils/logger";
import { truncate, pluralize } from "../utils/format";

/**
 * A compact digest of the whole project — the template-based context
 * compression from 2A (#7). Good enough to onboard a fresh agent in minutes;
 * a model adapter can later make it richer without changing the shape.
 */
export async function summarize(): Promise<void> {
  const p = await requireProject();
  const [config, memory, queue, completed, cp, entries] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    loadCompleted(p),
    readLatestCheckpoint(p),
    loadEntries(p),
  ]);

  logger.heading(`Summary · ${config?.name ?? "project"}`);

  const vision = firstLine(memory.vision);
  if (vision) logger.line(vision);

  logger.heading("State");
  logger.line(`  ${pluralize(queue.filter((t) => t.status !== "done").length, "open task")}` +
    ` · ${completed.length} completed` +
    ` · ${pluralize(entries.length, "knowledge entry", "knowledge entries")}`);
  logger.line(`  Last checkpoint ${checkpointAge(cp)}${cp ? `: ${truncate(cp.summary, 60)}` : ""}`);

  const decisions = entries.filter((e) => e.type === "decision").slice(-3);
  if (decisions.length) {
    logger.heading("Recent decisions");
    for (const d of decisions) logger.line(`  · ${truncate(d.title, 80)}`);
  }

  const next = nextActionable(queue);
  logger.heading("Next");
  logger.line(next ? `  → ${next.title}` : "  → run `continuity plan \"<goal>\"`");

  const upcoming = sortedByPriority(queue.filter((t) => t.status !== "done")).slice(1, 4);
  if (upcoming.length) {
    logger.dim("  then:");
    for (const t of upcoming) logger.dim(`    · ${truncate(t.title, 70)}`);
  }
  logger.line("");
}

function firstLine(md: string | undefined): string {
  if (!md) return "";
  const line = md
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#") && !/^_.*_$/.test(l.trim()));
  return line ? truncate(line, 120) : "";
}
