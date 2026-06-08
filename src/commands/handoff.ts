import { requireProject, UserError } from "./_shared";
import { generateHandoff } from "../core/handoffs";
import { normalizeTarget, getAdapter } from "../adapters/modelAdapters";
import { loadQueue, nextActionable } from "../core/tasks";
import { AGENT_TARGETS } from "../types";
import { logger } from "../utils/logger";
import { relativePath } from "../utils/format";

/**
 * Write a paste-ready briefing for a specific agent. The target is normalized
 * (aliases like "chatgpt"/"claude-code" are accepted); an unrecognized target
 * fails with a clear error rather than silently producing a generic doc.
 */
export async function handoff(
  to: string | undefined,
  opts: { print?: boolean }
): Promise<void> {
  const p = await requireProject();

  const target = normalizeTarget(to);
  if (!target) {
    throw new UserError(
      `Unknown agent "${to}". Choose one of: ${AGENT_TARGETS.join(", ")} ` +
        `(aliases like chatgpt, openai, claude-code, google also work).`
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
  logger.dim(`  optimized for: ${getAdapter(target).optimizesFor}`);
  if (next) {
    logger.line("");
    logger.line("Handing off this task:");
    logger.line(`  -> ${next.title}`);
  }
  logger.line("");
  logger.info(`Saved to ${relativePath(p.handoffs[target])}`);
  logger.dim(`View it with: continuity handoff --to ${target} --print`);
}
