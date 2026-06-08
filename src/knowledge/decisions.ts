import { Paths } from "../core/paths";
import { loadEntries, search } from "../core/knowledge";
import { KnowledgeEntry } from "../types";
import { relativeTime } from "../utils/format";

/**
 * Decision retrieval (v2B #5).
 *
 * A decision is just a `KnowledgeEntry` of type "decision", but it can carry
 * richer fields (context, alternatives, tradeoffs, tags, related files, and an
 * active/superseded status). Everything here is MIGRATION-TOLERANT: old entries
 * that predate the richer fields still load and display — missing fields are
 * simply omitted, never assumed.
 */

export interface DecisionFilter {
  tag?: string;
  active?: boolean;
  search?: string;
}

export async function loadDecisions(p: Paths): Promise<KnowledgeEntry[]> {
  const entries = await loadEntries(p);
  return entries.filter((e) => e.type === "decision");
}

/** A decision counts as active unless explicitly superseded/inactive. */
export function isActive(d: KnowledgeEntry): boolean {
  if (d.supersededBy) return false;
  const status = (d.status ?? "active").toLowerCase();
  return !["superseded", "inactive", "archived"].includes(status);
}

export async function filterDecisions(
  p: Paths,
  filter: DecisionFilter
): Promise<KnowledgeEntry[]> {
  let decisions = await loadDecisions(p);

  if (filter.tag) {
    const tag = filter.tag.toLowerCase();
    decisions = decisions.filter((d) => (d.tags ?? []).some((t) => t.toLowerCase() === tag));
  }

  if (filter.active) {
    decisions = decisions.filter(isActive);
  }

  if (filter.search && filter.search.trim()) {
    const hits = await search(p, filter.search);
    const rank = new Map(hits.map((h, i) => [h.entry.id, i]));
    decisions = decisions
      .filter((d) => rank.has(d.id))
      .sort((a, b) => (rank.get(a.id)! - rank.get(b.id)!));
  } else {
    // Newest first by creation time.
    decisions = [...decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return decisions;
}

/** A readable, migration-tolerant rendering of a single decision. */
export function formatDecision(d: KnowledgeEntry): string {
  const lines: string[] = [];
  const statusTag = isActive(d) ? "" : ` [${(d.status || "superseded").toLowerCase()}]`;
  lines.push(`- ${d.title}${statusTag}`);
  if (d.reason) lines.push(`    reason: ${d.reason}`);
  if (d.context) lines.push(`    context: ${d.context}`);
  if (d.alternatives?.length) lines.push(`    alternatives: ${d.alternatives.join("; ")}`);
  if (d.tradeoffs) lines.push(`    tradeoffs: ${d.tradeoffs}`);
  if (d.relatedFiles?.length) lines.push(`    files: ${d.relatedFiles.join(", ")}`);
  if (d.tags?.length) lines.push(`    tags: ${d.tags.join(", ")}`);
  if (d.supersededBy) lines.push(`    superseded by: ${d.supersededBy}`);
  lines.push(`    recorded: ${relativeTime(d.createdAt)} (${d.id})`);
  return lines.join("\n");
}
