import pc from "picocolors";
import { requireProject, UserError } from "./_shared";
import { registerEntity, loadEntities, loadRelations } from "../core/knowledge";
import { hints, printHint } from "../utils/hints";
import { logger } from "../utils/logger";
import { pluralize } from "../utils/format";

/**
 * `continuity entity add <name>` registers a concept the graph should track
 * (e.g. Polymarket, "liquidity engine"). Once registered, auto-linking detects
 * mentions of it in decisions and memory. `continuity entity list` shows them.
 */
export async function entityAdd(
  name: string | undefined,
  opts: { kind?: string; alias?: string[] }
): Promise<void> {
  const p = await requireProject();
  if (!name || !name.trim()) {
    throw new UserError('A name is required. Try: continuity entity add "Polymarket"');
  }

  const entity = await registerEntity(p, name, { kind: opts.kind, aliases: opts.alias });
  logger.success(`Entity registered: ${entity.name}`);
  logger.dim(`  kind: ${entity.kind}${entity.aliases.length ? ` · aliases: ${entity.aliases.join(", ")}` : ""}`);
  logger.line("");
  logger.info("Auto-linking will now connect decisions/memory that mention it.");
  logger.dim("  Run `continuity link --apply` to link existing entries.");
}

export async function entityList(): Promise<void> {
  const p = await requireProject();
  const [entities, relations] = await Promise.all([loadEntities(p), loadRelations(p)]);

  if (entities.length === 0) {
    printHint(hints.noEntities());
    return;
  }

  const degree = new Map<string, number>();
  for (const r of relations) {
    degree.set(r.from, (degree.get(r.from) ?? 0) + 1);
    degree.set(r.to, (degree.get(r.to) ?? 0) + 1);
  }

  logger.heading(`Entities (${entities.length})`);
  for (const e of [...entities].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))) {
    const links = degree.get(e.id) ?? 0;
    const aliases = e.aliases.length ? pc.dim(` (${e.aliases.join(", ")})`) : "";
    logger.line(`  ${e.name}${aliases}  ${pc.dim(`[${e.kind}] · ${pluralize(links, "link")}`)}`);
  }
  logger.line("");
}
