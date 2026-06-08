import pc from "picocolors";
import { requireProject, UserError } from "./_shared";
import { search, rebuild } from "../core/knowledge";
import { logger } from "../utils/logger";
import { relativeTime, truncate, relativePath } from "../utils/format";

/**
 * Search project memory and decisions. This is the user-facing payoff of the 2A
 * store: ask "why did we choose X?" and get the recorded answer instantly,
 * fully offline.
 */
export async function recall(
  query: string | undefined,
  opts: { limit?: string; rebuild?: boolean }
): Promise<void> {
  const p = await requireProject();

  if (opts.rebuild) {
    const { entries, indexed } = await rebuild(p);
    logger.success(`Knowledge index rebuilt: ${entries} entries, ${indexed} terms.`);
    if (!query) return;
  }

  if (!query || !query.trim()) {
    throw new UserError('Nothing to recall. Try: continuity recall "why polymarket"');
  }

  const limit = Math.max(1, parseInt(opts.limit ?? "8", 10) || 8);
  const hits = await search(p, query);

  if (hits.length === 0) {
    logger.info(`No matches for "${query}".`);
    logger.dim("If you've edited memory by hand, run `continuity recall --rebuild` first.");
    return;
  }

  logger.heading(`Recall · "${query}"`);
  for (const { entry, score } of hits.slice(0, limit)) {
    const tag = pc.dim(`[${entry.type}]`);
    logger.line(`  ${tag} ${pc.bold(truncate(entry.title, 80))}  ${pc.dim(`·${score}`)}`);
    if (entry.body) logger.dim(`     ${truncate(entry.body, 100)}`);
    const meta = [
      relativeTime(entry.updatedAt),
      entry.sourceFile ? relativePath(entry.sourceFile) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    logger.dim(`     ${meta}`);
  }
  logger.line("");
}
