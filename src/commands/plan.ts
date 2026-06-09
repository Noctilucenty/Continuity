import pc from "picocolors";
import { requireProject } from "./_shared";
import { bump } from "../store/metrics";
import { loadConfig, setMemory } from "../core/memory";
import { generateTasks } from "../core/planner";
import { loadQueue, saveQueue, mergeTasks, sortedByPriority } from "../core/tasks";
import { writeJson, readText } from "../utils/fs";
import { logger } from "../utils/logger";
import { pluralize, truncate } from "../utils/format";

/**
 * Turn a goal (+ existing memory) into a scored task list. If a goal is given,
 * it's recorded into config and seeded into next_actions so the planner has
 * something concrete to chew on.
 */
export async function plan(goal: string | undefined): Promise<void> {
  const p = await requireProject();

  if (goal && goal.trim()) {
    const config = (await loadConfig(p))!;
    config.goal = goal.trim();
    await writeJson(p.config, config);

    // Seed the goal as a next action if it isn't already captured.
    const existing = await readText(p.memory.nextActions, "");
    if (!existing.toLowerCase().includes(goal.trim().toLowerCase())) {
      await setMemory(p.memory.nextActions, existing.trimEnd() + `\n- ${goal.trim()}\n`);
    }
    logger.success(`Goal recorded: ${truncate(goal.trim(), 80)}`);
  }

  const incoming = await generateTasks(p);
  const queue = await loadQueue(p);
  const { merged, added } = mergeTasks(queue, incoming);
  await saveQueue(p, merged);
  if (added.length) await bump(p, "tasksCreated", added.length);

  if (added.length === 0) {
    logger.info("No new tasks — the queue already reflects your memory.");
    logger.dim("Add bugs to memory/bugs.md or steps to memory/next_actions.md, then re-plan.");
    return;
  }

  logger.success(`Generated ${pluralize(added.length, "task")}.`);
  logger.heading("Top of the queue");
  for (const t of sortedByPriority(merged).slice(0, 8)) {
    const isNew = added.some((a) => a.id === t.id);
    logger.line(`  ${isNew ? "＋" : " "} ${truncate(t.title, 68)}  ${pc.dim(`${t.source} · p${t.priority}`)}`);
  }
  logger.line("");
  logger.info("Run `continuity next` to start the highest-leverage one.");
}
