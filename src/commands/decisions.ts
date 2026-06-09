import { requireProject } from "./_shared";
import { filterDecisions, formatDecision } from "../knowledge/decisions";
import { hints, printHint } from "../utils/hints";
import { logger } from "../utils/logger";
import { pluralize } from "../utils/format";

/**
 * `continuity decisions` — browse the decision journal, with filters:
 *   --tag <tag>       only decisions carrying that tag
 *   --active          hide superseded/inactive decisions
 *   --search <query>  rank by relevance to a query
 */
export async function decisions(opts: {
  tag?: string;
  active?: boolean;
  search?: string;
}): Promise<void> {
  const p = await requireProject();
  const found = await filterDecisions(p, {
    tag: opts.tag,
    active: opts.active,
    search: opts.search,
  });

  const filters = [
    opts.tag ? `tag=${opts.tag}` : null,
    opts.active ? "active" : null,
    opts.search ? `search="${opts.search}"` : null,
  ].filter(Boolean);

  logger.heading(`Decisions${filters.length ? ` (${filters.join(", ")})` : ""}`);

  if (found.length === 0) {
    if (filters.length) {
      logger.info("No decisions match those filters.");
    } else {
      printHint(hints.noDecisions());
    }
    return;
  }

  logger.dim(`  ${pluralize(found.length, "decision")}`);
  logger.line("");
  for (const d of found) {
    logger.line(formatDecision(d));
    logger.line("");
  }
}
