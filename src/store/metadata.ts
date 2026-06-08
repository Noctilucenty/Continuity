import crypto from "crypto";

/**
 * Sync-ready data design (v2B #7).
 *
 * Continuity is local-first today, but the data model is being shaped so a
 * future sync layer can merge two copies of a project deterministically. The
 * pieces that make that possible — stable ids, timestamps, a schema version,
 * an origin label, and a content hash — are added here as OPTIONAL metadata.
 *
 * Nothing in this module is required to read existing data: every reader must
 * tolerate the fields being absent (old projects predate them). See
 * docs/sync-ready-data.md for the full format and merge strategy.
 */

/** Bump when the on-disk shape of stored records changes in a breaking way. */
export const SCHEMA_VERSION = 1;

/** Where a record originated. Useful once multiple devices/agents sync. */
export type RecordSource = "cli" | "checkpoint" | "rebuild" | "import" | "git";

export interface SyncMeta {
  schemaVersion: number;
  source: RecordSource;
  contentHash: string;
}

/**
 * A stable content hash over the meaningful fields of a record (ignoring
 * volatile metadata like timestamps and the hash itself). Two records with the
 * same content produce the same hash on any machine — the basis for dedupe and
 * conflict detection during a future sync.
 */
export function contentHash(content: unknown): string {
  const canonical = canonicalize(content);
  return crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Attach sync metadata to a record's content. `content` should be the
 * stable, meaningful fields only (not id/createdAt/updatedAt), so the hash is
 * reproducible.
 */
export function syncMeta(content: unknown, source: RecordSource): SyncMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    source,
    contentHash: contentHash(content),
  };
}

/**
 * Migration-tolerant reader: returns the record's schema version, treating a
 * missing field as version 0 (pre-metadata). Lets callers decide whether to
 * upgrade a record on next write.
 */
export function readSchemaVersion(record: { schemaVersion?: number }): number {
  return typeof record.schemaVersion === "number" ? record.schemaVersion : 0;
}

/** True if a record predates the sync-ready metadata and could be upgraded. */
export function needsUpgrade(record: { schemaVersion?: number }): boolean {
  return readSchemaVersion(record) < SCHEMA_VERSION;
}

/** A stable project id (used to scope records once projects sync). */
export function newProjectId(): string {
  return crypto.randomUUID();
}

/** Deterministic JSON: keys sorted recursively so hashing is stable. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}
