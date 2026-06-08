# Sync-ready data design

Continuity is local-first today. There is no cloud sync yet — and this document
does not describe one. It describes how the local data model is being shaped so a
future sync layer can merge two copies of a project deterministically, without
breaking any existing data.

## Metadata fields

Records carry optional sync metadata (see `src/store/metadata.ts`):

| Field | Meaning |
|-------|---------|
| `schemaVersion` | The on-disk shape version. Bumped on breaking changes. Current: `1`. |
| `source` | Where the record originated: `cli`, `checkpoint`, `rebuild`, `import`, `git`. |
| `contentHash` | A stable 16-char hash over the record's *meaningful* fields (not ids or timestamps). |

Knowledge entries already had stable `id`, `createdAt`, and `updatedAt`. The
project config additionally carries an optional `projectId` (a UUID) so records
can be scoped to a project once multiple devices or agents sync.

## Why a content hash

`contentHash` is computed over canonical (key-sorted) JSON of the meaningful
fields, so the same content hashes identically on any machine. That is the basis
for two future operations:

- **Dedupe** — two records with the same hash are the same fact.
- **Conflict detection** — same `id`, different hash, means a genuine edit on two
  sides that a merge must reconcile (last-writer-wins by `updatedAt`, or a
  prompt).

Timestamps and ids are deliberately excluded from the hash so they do not create
false conflicts.

## Migration tolerance (the hard rule)

Every reader must tolerate these fields being absent — older projects predate
them. Helpers enforce this:

- `readSchemaVersion(record)` returns `0` for a record with no `schemaVersion`.
- `needsUpgrade(record)` is `true` when a record is older than `SCHEMA_VERSION`.

Nothing crashes on old data; new writes simply start carrying metadata. Old
entries are upgraded lazily the next time they are written.

## What sync will (eventually) look like

Not built yet. The intended shape, enabled by the above:

1. Each device keeps its local files as the source of truth.
2. A sync layer exchanges records by `id`.
3. Matching `id` + matching `contentHash` -> identical, skip.
4. Matching `id` + differing `contentHash` -> conflict, resolved by `updatedAt`
   (last writer wins) or surfaced to the user.
5. New `id` -> add.
6. `projectId` scopes everything so unrelated projects never collide.

No cloud dependency is introduced until that layer is actually built.
