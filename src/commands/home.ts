import { paths, Paths } from "../core/paths";
import { isInitialized, loadConfig, readMemory } from "../core/memory";
import { loadQueue, loadCompleted, nextActionable } from "../core/tasks";
import { listCheckpoints, readLatestCheckpoint, checkpointAge } from "../core/checkpoints";
import { logger } from "../utils/logger";
import { truncate } from "../utils/format";

/**
 * The friendly home screen (v0.6).
 *
 * Bare `continuity` runs this. Inside a project it shows a short dashboard plus
 * the single next action and the daily loop; outside a project it shows a
 * getting-started screen. It never dumps the command wall, never increments
 * metrics, and tolerates a partial/missing `.continuity` (read-only, all loaders
 * fall back to empty).
 */

export interface HomeModel {
  initialized: boolean;
  projectName?: string;
  state?: string;
  activeTasks: number;
  doneTasks: number;
  checkpoints: number;
  lastCheckpoint?: string;
  nextCommand: string;
}

export async function gatherHome(p: Paths = paths()): Promise<HomeModel> {
  if (!(await isInitialized(p))) {
    return {
      initialized: false,
      activeTasks: 0,
      doneTasks: 0,
      checkpoints: 0,
      nextCommand: "continuity init",
    };
  }

  const [config, memory, queue, completed, cps, latest] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    loadCompleted(p),
    listCheckpoints(p),
    readLatestCheckpoint(p),
  ]);

  const active = queue.filter((t) => t.status !== "done").length;
  const next = nextActionable(queue);

  return {
    initialized: true,
    projectName: config?.name,
    state: firstLine(memory.current_state) || config?.goal,
    activeTasks: active,
    doneTasks: completed.length,
    checkpoints: cps.length,
    lastCheckpoint: latest ? checkpointAge(latest) : undefined,
    nextCommand: next ? "continuity next" : 'continuity plan "what you are building"',
  };
}

export function renderHome(m: HomeModel): string {
  if (!m.initialized) {
    return [
      "Continuity",
      "",
      "The persistent intelligence layer for AI-powered work.",
      "",
      "Start here:",
      "  1. cd your-project",
      "  2. continuity init",
      '  3. continuity plan "what you are building"',
      "",
      "Daily loop:",
      "  continuity next",
      "  continuity checkpoint --from-git",
      "  continuity handoff --to gpt --copy",
    ].join("\n");
  }

  const lines: string[] = ["Continuity", "", `Project: ${m.projectName ?? "(unnamed)"}`];
  if (m.state) lines.push(`State: ${truncate(m.state, 80)}`);
  lines.push(`Tasks: ${m.activeTasks} active, ${m.doneTasks} done`);
  lines.push(`Checkpoints: ${m.checkpoints} saved`);
  if (m.lastCheckpoint) lines.push(`Last checkpoint: ${m.lastCheckpoint}`);
  lines.push(
    "",
    "Next best action:",
    `  ${m.nextCommand}`,
    "",
    "Daily loop:",
    "  1. continuity next",
    "  2. do the work",
    "  3. continuity done",
    "  4. continuity checkpoint --from-git",
    "  5. continuity handoff --to claude --copy",
    "",
    "Need context?",
    '  continuity ask "what should we work on next?"',
    "  continuity pack memory"
  );
  return lines.join("\n");
}

/** Bare-command entry point. Always succeeds. */
export async function home(): Promise<void> {
  try {
    const model = await gatherHome();
    logger.line(renderHome(model));
  } catch {
    // The home screen must never error out. Fall back to getting-started.
    logger.line(renderHome({ initialized: false, activeTasks: 0, doneTasks: 0, checkpoints: 0, nextCommand: "continuity init" }));
  }
}

function firstLine(md: string | undefined): string {
  if (!md) return "";
  const line = md
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#") && !/^_.*_$/.test(l.trim()));
  return line ? line.trim() : "";
}
