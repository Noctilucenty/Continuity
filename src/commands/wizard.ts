import path from "path";
import readline from "readline";
import { checkpoint } from "./checkpoint";
import { init } from "./init";
import { next } from "./next";
import { plan } from "./plan";
import { paths } from "../core/paths";
import { isInitialized, loadConfig } from "../core/memory";
import { logger } from "../utils/logger";
import { ask } from "../utils/prompt";

export interface WizardOpts {
  name?: string;
  goal?: string;
  start?: boolean;
  checkpoint?: boolean;
}

/**
 * Guided first-run flow. The wizard is deliberately an orchestration layer over
 * existing commands, so init/plan/next/checkpoint remain the source of truth.
 */
export async function wizard(opts: WizardOpts = {}): Promise<void> {
  const p = paths();
  const tty = interactive();
  const initialized = await isInitialized(p);

  if (!initialized) {
    const name = opts.name ?? (tty ? await ask("Project name", path.basename(p.cwd)) : "");
    if (!name.trim()) {
      logger.warn("Interactive wizard needs a project name.");
      logger.dim("Run `continuity wizard --name <name> --goal <goal>` in scripts.");
      return;
    }
    await init({ name: name.trim() });
  } else {
    logger.info("Continuity project already initialized.");
  }

  const config = await loadConfig(p);
  const goal =
    opts.goal ??
    (tty ? await ask("Project goal", config?.goal ?? "Ship the next milestone") : config?.goal ?? "");
  if (!goal.trim()) {
    logger.warn("Interactive wizard needs a goal before it can plan.");
    logger.dim('Run `continuity wizard --goal "what you are building"`.');
    return;
  }

  await plan(goal.trim());

  const shouldStart = opts.start ?? (tty ? await askYesNo("Start the next task now?", true) : false);
  if (shouldStart) {
    await next({});
  } else {
    logger.info("Start later with `continuity next`.");
  }

  const shouldCheckpoint =
    opts.checkpoint ?? (tty ? await askYesNo("Create a checkpoint from current git changes?", false) : false);
  if (shouldCheckpoint) {
    await checkpoint({ fromGit: true });
  } else {
    logger.info("Checkpoint later with `continuity checkpoint --from-git`.");
  }
}

function interactive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function askYesNo(question: string, fallback: boolean): Promise<boolean> {
  if (!interactive()) return Promise.resolve(fallback);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const hint = fallback ? "Y/n" : "y/N";

  return new Promise((resolve) => {
    rl.question(`${question} (${hint}): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (!normalized) return resolve(fallback);
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}
