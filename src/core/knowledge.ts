import { Paths } from "./paths";
import {
  KnowledgeEntry,
  Entity,
  Relation,
  KeywordIndex,
  EntryType,
} from "../types";
import { extractListItems } from "./memory";
import { readJson, writeJson, readText } from "../utils/fs";
import { now, shortId } from "../utils/format";

/**
 * The 2A knowledge store: a typed, queryable layer beside the markdown memory.
 *
 * Design invariant — the markdown files remain the source of truth. This store
 * is a DERIVED index: every entry records its `sourceFile`, and `rebuildIndex`
 * can regenerate the whole thing from the markdown. Delete `knowledge/` and you
 * lose nothing real; you rebuild it. That keeps v1's local-first, files-as-truth
 * guarantee intact while giving `recall`, `decide`, and `graph` something fast
 * and structured to read.
 *
 * Every write to typed memory funnels through this one module — the same
 * single-anchor discipline as `nextActionable` in tasks.ts — so the decision
 * journal and the graph never drift out of sync.
 */

/* ---------- load / save ---------- */

export async function loadEntries(p: Paths): Promise<KnowledgeEntry[]> {
  return readJson<KnowledgeEntry[]>(p.knowledge.entries, []);
}

export async function saveEntries(p: Paths, entries: KnowledgeEntry[]): Promise<void> {
  await writeJson(p.knowledge.entries, entries);
}

export async function loadEntities(p: Paths): Promise<Entity[]> {
  return readJson<Entity[]>(p.knowledge.entities, []);
}

export async function saveEntities(p: Paths, entities: Entity[]): Promise<void> {
  await writeJson(p.knowledge.entities, entities);
}

export async function loadRelations(p: Paths): Promise<Relation[]> {
  return readJson<Relation[]>(p.knowledge.relations, []);
}

export async function saveRelations(p: Paths, relations: Relation[]): Promise<void> {
  await writeJson(p.knowledge.relations, relations);
}

export async function loadIndex(p: Paths): Promise<KeywordIndex> {
  return readJson<KeywordIndex>(p.knowledge.index, {});
}

export async function saveIndex(p: Paths, index: KeywordIndex): Promise<void> {
  await writeJson(p.knowledge.index, index);
}

/* ---------- entries ---------- */

export interface NewEntryInput {
  type: EntryType;
  title: string;
  body?: string;
  status?: string;
  tags?: string[];
  entities?: string[];
  reason?: string;
  alternatives?: string[];
  tradeoffs?: string;
  sourceFile?: string;
}

export function makeEntry(input: NewEntryInput): KnowledgeEntry {
  const ts = now();
  return {
    id: shortId("k"),
    type: input.type,
    title: input.title.trim(),
    body: (input.body ?? "").trim(),
    status: input.status ?? "active",
    tags: dedupeLower(input.tags ?? []),
    entities: dedupeLower(input.entities ?? []),
    reason: input.reason?.trim() || undefined,
    alternatives: input.alternatives?.filter((a) => a.trim()) || undefined,
    tradeoffs: input.tradeoffs?.trim() || undefined,
    sourceFile: input.sourceFile,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Add an entry to the store and keep the keyword index current. Skips exact
 * title+type duplicates so re-running checkpoint/rebuild is idempotent.
 * Returns the entry that now lives in the store (existing or newly added).
 */
export async function addEntry(
  p: Paths,
  input: NewEntryInput
): Promise<{ entry: KnowledgeEntry; added: boolean }> {
  const entries = await loadEntries(p);
  const existing = entries.find(
    (e) =>
      e.type === input.type &&
      e.title.toLowerCase() === input.title.trim().toLowerCase()
  );
  if (existing) return { entry: existing, added: false };

  const entry = makeEntry(input);
  entries.push(entry);
  await saveEntries(p, entries);

  const index = await loadIndex(p);
  indexEntry(index, entry);
  await saveIndex(p, index);

  return { entry, added: true };
}

/* ---------- search ---------- */

export interface SearchHit {
  entry: KnowledgeEntry;
  score: number;
}

/**
 * Keyword search over the index, falling back to a substring scan so a query
 * always returns *something* useful even before the index is warm.
 */
export async function search(p: Paths, query: string): Promise<SearchHit[]> {
  const entries = await loadEntries(p);
  if (entries.length === 0) return [];

  const index = await loadIndex(p);
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const byId = new Map(entries.map((e) => [e.id, e]));
  const scores = new Map<string, number>();

  for (const term of terms) {
    // Exact index hits.
    for (const id of index[term] ?? []) {
      scores.set(id, (scores.get(id) ?? 0) + 3);
    }
    // Prefix hits (so "predict" matches "prediction").
    for (const [token, ids] of Object.entries(index)) {
      if (token !== term && token.startsWith(term)) {
        for (const id of ids) scores.set(id, (scores.get(id) ?? 0) + 1);
      }
    }
  }

  // Substring fallback against the raw text, for anything the index missed.
  const haystackTerms = terms;
  for (const entry of entries) {
    const hay = `${entry.title} ${entry.body} ${entry.tags.join(" ")}`.toLowerCase();
    for (const term of haystackTerms) {
      if (hay.includes(term)) scores.set(entry.id, (scores.get(entry.id) ?? 0) + 1);
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ entry: byId.get(id)!, score }))
    .filter((h) => h.entry)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt.localeCompare(a.entry.updatedAt));
}

/* ---------- relations / entities ---------- */

export async function addRelation(p: Paths, relation: Relation): Promise<boolean> {
  const relations = await loadRelations(p);
  const exists = relations.some(
    (r) => r.from === relation.from && r.to === relation.to && r.kind === relation.kind
  );
  if (exists) return false;
  relations.push(relation);
  await saveRelations(p, relations);
  return true;
}

export async function ensureEntity(p: Paths, name: string, kind = "concept"): Promise<Entity> {
  const entities = await loadEntities(p);
  const norm = name.trim().toLowerCase();
  const found = entities.find(
    (e) => e.name.toLowerCase() === norm || e.aliases.some((a) => a.toLowerCase() === norm)
  );
  if (found) return found;
  const entity: Entity = { id: shortId("e"), name: name.trim(), kind, aliases: [] };
  entities.push(entity);
  await saveEntities(p, entities);
  return entity;
}

/* ---------- index rebuild / backfill ---------- */

/**
 * Rebuild the entire store's index from scratch, and backfill typed entries
 * from the markdown memory (bugs, decisions, risks, lessons). This is what makes
 * an existing project — or a project edited by hand — queryable. Idempotent.
 */
export async function rebuild(p: Paths): Promise<{ entries: number; indexed: number }> {
  // Backfill from markdown memory.
  const backfills: { file: string; name: string; type: EntryType }[] = [
    { file: p.memory.bugs, name: "bugs", type: "bug" },
    { file: p.memory.decisions, name: "decisions", type: "decision" },
    { file: p.memory.risks, name: "risks", type: "assumption" },
  ];

  const entries = await loadEntries(p);
  const seen = new Set(entries.map((e) => `${e.type}::${e.title.toLowerCase()}`));

  for (const { file, type } of backfills) {
    const text = await readText(file, "");
    for (const item of extractListItems(text)) {
      const key = `${type}::${item.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(makeEntry({ type, title: item, sourceFile: file }));
    }
  }
  await saveEntries(p, entries);

  // Rebuild the inverted index from the full entry set.
  const index: KeywordIndex = {};
  for (const entry of entries) indexEntry(index, entry);
  await saveIndex(p, index);

  const indexed = Object.keys(index).length;
  return { entries: entries.length, indexed };
}

/* ---------- internals ---------- */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "it", "this", "that", "we", "our", "as",
  "at", "by", "from", "into", "than", "then", "so", "not", "no", "do", "did",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function indexEntry(index: KeywordIndex, entry: KnowledgeEntry): void {
  const tokens = new Set(
    tokenize(`${entry.title} ${entry.body} ${entry.tags.join(" ")} ${entry.entities.join(" ")}`)
  );
  for (const token of tokens) {
    const bucket = index[token] ?? (index[token] = []);
    if (!bucket.includes(entry.id)) bucket.push(entry.id);
  }
}

function dedupeLower(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
