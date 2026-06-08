import pc from "picocolors";
import { requireProject } from "./_shared";
import { loadEntities, loadRelations, loadEntries } from "../core/knowledge";
import { logger } from "../utils/logger";
import { truncate } from "../utils/format";
import { Entity, Relation } from "../types";

const REL_LABEL: Record<string, string> = {
  depends_on: "depends on",
  chose_over: "chosen over",
  caused_by: "caused by",
  relates_to: "relates to",
};

/**
 * Render the knowledge graph — entities and the relations between them — as an
 * ASCII tree (2A #2). `--json` emits the raw graph for tooling. Built from
 * explicit relations only; no LLM, fully offline.
 */
export async function graph(opts: { json?: boolean }): Promise<void> {
  const p = await requireProject();
  const [entities, relations, entries] = await Promise.all([
    loadEntities(p),
    loadRelations(p),
    loadEntries(p),
  ]);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ entities, relations }, null, 2) + "\n");
    return;
  }

  if (entities.length === 0 && relations.length === 0) {
    logger.info("The knowledge graph is empty.");
    logger.dim("Record a decision with a relation: continuity decide --over \"<alternative>\"");
    logger.dim(`Decisions captured so far: ${entries.filter((e) => e.type === "decision").length}`);
    return;
  }

  const byId = new Map(entities.map((e) => [e.id, e]));
  const outgoing = new Map<string, Relation[]>();
  for (const r of relations) {
    const bucket = outgoing.get(r.from) ?? [];
    bucket.push(r);
    outgoing.set(r.from, bucket);
  }

  logger.heading(`Knowledge graph · ${entities.length} nodes · ${relations.length} edges`);

  // Roots: entities that are a "from" but never a "to" (top of the tree).
  const targets = new Set(relations.map((r) => r.to));
  const roots = entities.filter((e) => outgoing.has(e.id) && !targets.has(e.id));
  const shown = roots.length ? roots : entities.filter((e) => outgoing.has(e.id));

  for (const root of shown) {
    printNode(root, outgoing, byId, new Set());
  }

  // Orphans: entities with no edges at all.
  const connected = new Set<string>();
  for (const r of relations) {
    connected.add(r.from);
    connected.add(r.to);
  }
  const orphans = entities.filter((e) => !connected.has(e.id));
  if (orphans.length) {
    logger.heading("Unconnected");
    for (const o of orphans) logger.dim(`  · ${o.name}`);
  }
  logger.line("");
}

function printNode(
  node: Entity,
  outgoing: Map<string, Relation[]>,
  byId: Map<string, Entity>,
  visited: Set<string>,
  depth = 0
): void {
  const indent = "  ".repeat(depth + 1);
  if (depth === 0) {
    logger.line(`${indent}${pc.bold(node.name)} ${pc.dim(`(${node.kind})`)}`);
  }
  if (visited.has(node.id)) return;
  visited.add(node.id);

  for (const rel of outgoing.get(node.id) ?? []) {
    const child = byId.get(rel.to);
    const label = REL_LABEL[rel.kind] ?? rel.kind;
    const name = child?.name ?? rel.to;
    const note = rel.note ? pc.dim(` — ${truncate(rel.note, 50)}`) : "";
    logger.line(`${indent}  ${pc.dim("└─")} ${pc.cyan(label)} → ${name}${note}`);
    if (child && !visited.has(child.id)) {
      printNode(child, outgoing, byId, visited, depth + 1);
    }
  }
}
