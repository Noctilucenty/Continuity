import { requireProject, UserError } from "./_shared";
import {
  Runner,
  RUNNERS,
  installRunner,
  uninstallRunner,
  runnerStatus,
} from "../agent/install";
import { logger } from "../utils/logger";

/**
 * `continuity agent install|status|uninstall [--runner claude|codex|cursor|all]`
 * — wire AI coding agents to Continuity's MCP server so resume/checkpoint run
 * automatically.
 */

function resolveRunners(opt: string | undefined): Runner[] {
  if (!opt || opt === "all") return RUNNERS;
  const value = opt.toLowerCase();
  if (!(RUNNERS as string[]).includes(value)) {
    throw new UserError(`Unknown runner "${opt}". Choose one of: ${RUNNERS.join(", ")}, all.`);
  }
  return [value as Runner];
}

export async function agentInstall(opts: { runner?: string }): Promise<void> {
  const p = await requireProject();
  const runners = resolveRunners(opts.runner);

  logger.heading("Installing Continuity agent hooks");
  for (const runner of runners) {
    const changes = await installRunner(p, runner);
    for (const c of changes) logger.line(`  ${c.action === "created" ? "created" : "updated"}: ${c.file}`);
  }
  logger.line("");
  logger.success("Agents will now load resume at session start and checkpoint before stopping.");
  logger.dim("  The MCP server runs via: continuity mcp");
  logger.dim("  Re-run anytime; it is idempotent. Remove with: continuity agent uninstall");
}

export async function agentStatus(opts: { runner?: string }): Promise<void> {
  const p = await requireProject();
  const runners = resolveRunners(opts.runner);

  logger.heading("Continuity agent hooks");
  for (const runner of runners) {
    const s = await runnerStatus(p, runner);
    const mcp = s.mcpInstalled === null ? "n/a (global config)" : s.mcpInstalled ? "installed" : "not installed";
    const instr = s.instructionInstalled ? "installed" : "not installed";
    logger.line(`  ${runner.padEnd(7)} instructions: ${instr} · mcp: ${mcp}`);
  }
  logger.line("");
}

export async function agentUninstall(opts: { runner?: string }): Promise<void> {
  const p = await requireProject();
  const runners = resolveRunners(opts.runner);

  logger.heading("Removing Continuity agent hooks");
  let any = false;
  for (const runner of runners) {
    const removed = await uninstallRunner(p, runner);
    for (const f of removed) {
      logger.line(`  cleaned: ${f}`);
      any = true;
    }
  }
  if (!any) logger.info("Nothing to remove.");
  logger.line("");
}
