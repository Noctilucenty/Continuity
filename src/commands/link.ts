import pc from "picocolors";
import { requireProject } from "./_shared";
import { autoLinkAll } from "../knowledge/autoLink";
import { loadEntities } from "../core/knowledge";
import { logger } from "../utils/logger";
import { pluralize } from "../utils/format";

/**
 * `continuity link` — scan decisions and memory for mentions of known entities
 * and propose relates_to edges. Preview by default; `--apply` writes them.
 */
export async function link(opts: { apply?: boolean }): Promise<void> {
  const p = await requireProject();

  const entities = await loadEntities(p);
  if (entities.length === 0) {
    logger.info("No entities to link against yet.");
    logger.dim('  Register some first: continuity entity add "Polymarket"');
    return;
  }

  const result = await autoLinkAll(p, { apply: Boolean(opts.apply) });

  if (result.proposed.length === 0) {
    logger.info("No new connections found.");
    logger.dim("  The graph already reflects the entities mentioned in your decisions/memory.");
    return;
  }

  logger.heading(opts.apply ? "Connections added" : "Proposed connections");
  for (const link of result.proposed) {
    const arrow = pc.cyan("relates to");
    const src = pc.dim(`(${link.source})`);
    logger.line(`  ${link.fromName} ${arrow} ${link.toName} ${src}`);
  }

  logger.line("");
  if (opts.apply) {
    logger.success(`Added ${pluralize(result.applied, "connection")} to the graph.`);
    logger.dim("  View it with: continuity graph");
  } else {
    logger.dim(`${pluralize(result.proposed.length, "connection")} proposed. Run \`continuity link --apply\` to add them.`);
  }
}
