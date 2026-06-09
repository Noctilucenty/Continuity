import { Paths, memoryFiles } from "../core/paths";
import {
  loadEntities,
  loadEntries,
  loadRelations,
  ensureEntity,
  addRelation,
  entryText,
} from "../core/knowledge";
import { readMemory } from "../core/memory";
import { Entity, KnowledgeEntry } from "../types";

/**
 * Entity auto-linking (v0.5).
 *
 * The knowledge graph used to grow only when you typed `decide --over`. This
 * detects mentions of *known* entities inside decision and memory text and
 * proposes `relates_to` edges automatically — so recording "build the liquidity
 * engine on the Polymarket feed" links that decision to the Polymarket entity
 * without any manual wiring. Connecting decisions this way makes `pack`/`ask`
 * richer.
 *
 * Deterministic and offline: whole-word, case-insensitive matching of entity
 * names + aliases. The matcher functions are pure so they unit-test directly.
 */

export interface EntityMatcher {
  id: string;
  name: string;
  regex: RegExp;
}

/**
 * Build one whole-word matcher per entity (name + aliases). Variants are sorted
 * longest-first so "Polymarket API" wins over "Polymarket" when both exist.
 */
export function buildEntityMatchers(entities: Entity[]): EntityMatcher[] {
  const matchers: EntityMatcher[] = [];
  for (const e of entities) {
    const variants = [e.name, ...e.aliases]
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    if (variants.length === 0) continue;
    const alt = variants
      .map(escapeRegex)
      .sort((a, b) => b.length - a.length)
      .join("|");
    // Not preceded/followed by a word char or hyphen -> whole-word/phrase match.
    matchers.push({ id: e.id, name: e.name, regex: new RegExp(`(?<![\\w-])(?:${alt})(?![\\w-])`, "i") });
  }
  return matchers;
}

/** Entity ids whose name/alias appears as a whole word in `text` (excludes one id). */
export function findMentions(
  text: string,
  matchers: EntityMatcher[],
  excludeId?: string
): string[] {
  const found = new Set<string>();
  for (const m of matchers) {
    if (m.id === excludeId) continue;
    if (m.regex.test(text)) found.add(m.id);
  }
  return [...found];
}

export interface ProposedLink {
  fromName: string;
  fromId?: string;
  fromKind: "decision" | "concept";
  toId: string;
  toName: string;
  source: "decision" | "memory";
}

export interface AutoLinkResult {
  proposed: ProposedLink[];
  applied: number;
}

/**
 * Scan all decisions and memory for entity mentions and propose relates_to
 * edges. Preview by default; `apply` creates the entities (for new decision
 * nodes) and relations. Symmetric dedupe: an edge in either direction counts as
 * existing.
 */
export async function autoLinkAll(
  p: Paths,
  { apply }: { apply: boolean }
): Promise<AutoLinkResult> {
  const [entities, entries, relations, memory] = await Promise.all([
    loadEntities(p),
    loadEntries(p),
    loadRelations(p),
    readMemory(p),
  ]);

  const concepts = entities.filter((e) => e.kind !== "decision");
  const matchers = buildEntityMatchers(concepts);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const byLowerName = new Map(entities.map((e) => [e.name.toLowerCase(), e]));

  // Existing relates_to edges, undirected, keyed by entity ids.
  const existing = new Set<string>();
  for (const r of relations) {
    if (r.kind === "relates_to") existing.add(idPair(r.from, r.to));
  }

  const proposed: ProposedLink[] = [];
  const seen = new Set<string>(); // undirected dedupe within this run, by name

  // 1. Decision text -> mentioned concept entities.
  for (const entry of entries) {
    if (entry.type !== "decision") continue;
    const fromEntity = byLowerName.get(entry.title.toLowerCase());
    const fromId = fromEntity?.id;
    for (const toId of findMentions(entryText(entry), matchers, fromId)) {
      if (fromId && (fromId === toId || existing.has(idPair(fromId, toId)))) continue;
      const to = byId.get(toId)!;
      const key = namePair(entry.title, to.name);
      if (seen.has(key)) continue;
      seen.add(key);
      proposed.push({ fromName: entry.title, fromId, fromKind: "decision", toId, toName: to.name, source: "decision" });
    }
  }

  // 2. Memory co-occurrence (per line) between concept entities.
  for (const { name } of memoryFiles(p)) {
    for (const line of (memory[name] ?? "").split("\n")) {
      if (line.startsWith("#") || line.trim().length < 3) continue;
      const ids = findMentions(line, matchers);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i];
          const b = ids[j];
          if (existing.has(idPair(a, b))) continue;
          const ea = byId.get(a)!;
          const eb = byId.get(b)!;
          const key = namePair(ea.name, eb.name);
          if (seen.has(key)) continue;
          seen.add(key);
          proposed.push({ fromName: ea.name, fromId: a, fromKind: "concept", toId: b, toName: eb.name, source: "memory" });
        }
      }
    }
  }

  let applied = 0;
  if (apply) {
    for (const link of proposed) {
      const fromId =
        link.fromId ??
        (await ensureEntity(p, link.fromName, link.fromKind === "decision" ? "decision" : "concept")).id;
      if (fromId === link.toId) continue;
      const ok = await addRelation(p, {
        from: fromId,
        to: link.toId,
        kind: "relates_to",
        note: `auto: ${link.source}`,
      });
      if (ok) applied++;
    }
  }

  return { proposed, applied };
}

/**
 * Link a single decision to any known concept entities it mentions, applying
 * immediately. Used by `decide` so the graph grows as you record decisions.
 * Returns the names of entities it linked to.
 */
export async function linkDecision(p: Paths, decision: KnowledgeEntry): Promise<string[]> {
  const entities = await loadEntities(p);
  const concepts = entities.filter((e) => e.kind !== "decision");
  const matchers = buildEntityMatchers(concepts);
  const mentions = findMentions(entryText(decision), matchers);
  if (mentions.length === 0) return [];

  const fromId = (await ensureEntity(p, decision.title, "decision")).id;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const linked: string[] = [];
  for (const toId of mentions) {
    if (toId === fromId) continue;
    const ok = await addRelation(p, { from: fromId, to: toId, kind: "relates_to", note: "auto: decision" });
    const to = byId.get(toId);
    if (ok && to) linked.push(to.name);
  }
  return linked;
}

/* ---------- internals ---------- */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function idPair(a: string, b: string): string {
  return [a, b].sort().join("::");
}

function namePair(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join("::");
}
