import { requireProject, UserError } from "./_shared";
import { generateHandoff } from "../core/handoffs";
import { loadQueue, nextActionable } from "../core/tasks";
import { AGENT_TARGETS, AgentTarget } from "../types";
import { logger } from "../utils/logger";
import { relativePath } from "../utils/format";

/**
 * Write a paste-ready briefing for a specific agent. The preview names the same
 * next task as `next`/`resume` (via `nextActionable`) so a handoff never points
 * somewhere different from the rest of the tool.
 */
export async function handoff(
  to: string | undefined,
  opts: { print?: boolean }
): Promise<void> {
  const p = await requireProject();

  const target = (to ?? "generic").toLowerCase() as AgentTarget;
  if (!AGENT_TARGETS.includes(target)) {
    throw new UserError(
      `Unknown agent "${to}". Choose one of: ${AGENT_TARGETS.join(", ")}.`
    );
  }

  const doc = await generateHandoff(p, target);

  if (opts.print) {
    logger.line(doc);
    return;
  }

  const queue = await loadQueue(p);
  const next = nextActionable(queue);

  logger.success(`Handoff written for ${target}.`);
  if (next) {
    logger.line("");
    logger.line(`Handing off this task:`);
    logger.line(`  → ${next.title}`);
  }
  logger.line("");
  logger.info(`Saved to ${relativePath(p.handoffs[target])}`);
  logger.dim(`View it with: continuity handoff --to ${target} --print`);
}
