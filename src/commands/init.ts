import path from "path";
import { paths } from "../core/paths";
import { isInitialized, setMemory } from "../core/memory";
import { TEMPLATES, rootDoc } from "../core/templates";
import { ProjectConfig } from "../types";
import { ensureDir, writeJson, writeText, pathExists } from "../utils/fs";
import { ask } from "../utils/prompt";
import { logger } from "../utils/logger";
import { now, relativePath } from "../utils/format";
import { newProjectId, SCHEMA_VERSION } from "../store/metadata";
import { defaultMetrics } from "../store/metrics";

/**
 * Scaffold a complete `.continuity/` workspace. Idempotent-ish: refuses to
 * clobber an existing project unless --force is passed.
 */
export async function init(opts: { force?: boolean; name?: string }): Promise<void> {
  const p = paths();

  if ((await isInitialized(p)) && !opts.force) {
    logger.warn("This project is already initialized.");
    logger.dim("Use `continuity status` to see it, or `--force` to re-scaffold.");
    return;
  }

  const defaultName = path.basename(p.cwd);
  const name = opts.name ?? (await ask("Project name", defaultName));

  // Directory tree.
  await ensureDir(p.memory.dir);
  await ensureDir(p.tasks.dir);
  await ensureDir(p.sessions.checkpoints);
  await ensureDir(p.handoffs.dir);
  await ensureDir(p.knowledge.dir);

  // Memory files.
  await setMemory(p.memory.vision, TEMPLATES.vision);
  await setMemory(p.memory.architecture, TEMPLATES.architecture);
  await setMemory(p.memory.currentState, TEMPLATES.currentState);
  await setMemory(p.memory.decisions, TEMPLATES.decisions);
  await setMemory(p.memory.bugs, TEMPLATES.bugs);
  await setMemory(p.memory.nextActions, TEMPLATES.nextActions);
  await setMemory(p.memory.risks, TEMPLATES.risks);

  // Tasks.
  await writeJson(p.tasks.queue, []);
  await writeJson(p.tasks.completed, []);

  // Sessions.
  await writeText(p.sessions.log, TEMPLATES.sessionLog);

  // Knowledge store (2A).
  await writeJson(p.knowledge.entries, []);
  await writeJson(p.knowledge.entities, []);
  await writeJson(p.knowledge.relations, []);
  await writeJson(p.knowledge.index, {});

  // Handoff placeholders so the files always exist.
  for (const target of ["claude", "gpt", "cursor", "gemini", "generic"] as const) {
    if (!(await pathExists(p.handoffs[target]))) {
      await writeText(
        p.handoffs[target],
        `# Handoff → ${target}\n\n_Run \`continuity checkpoint\` or \`continuity handoff --to ${target}\` to populate this._\n`
      );
    }
  }

  // Config + root doc.
  const config: ProjectConfig = {
    name,
    version: "0.5.0",
    createdAt: now(),
    projectId: newProjectId(),
    schemaVersion: SCHEMA_VERSION,
  };
  await writeJson(p.config, config);
  await writeJson(p.metrics, defaultMetrics());
  await writeText(p.rootDoc, rootDoc(name));

  logger.success(`Continuity initialized for ${name}.`);
  logger.line("");
  logger.line("Created:");
  for (const dir of [p.memory.dir, p.tasks.dir, p.sessions.dir, p.handoffs.dir, p.knowledge.dir]) {
    logger.artifact("dir ", relativePath(dir) + "/");
  }
  logger.artifact("file", relativePath(p.config));
  logger.artifact("file", relativePath(p.rootDoc));
  logger.line("");
  logger.info("Next: `continuity plan \"<your goal>\"` to generate your first tasks.");
}
