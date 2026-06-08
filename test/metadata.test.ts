import { describe, it, expect, afterEach } from "vitest";
import {
  SCHEMA_VERSION,
  contentHash,
  syncMeta,
  readSchemaVersion,
  needsUpgrade,
  newProjectId,
} from "../src/store/metadata";
import { makeEntry, addEntry, loadEntries, saveEntries } from "../src/core/knowledge";
import { loadConfig } from "../src/core/memory";
import { writeJson } from "../src/utils/fs";
import { ProjectConfig, KnowledgeEntry } from "../src/types";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("contentHash", () => {
  it("is deterministic and key-order independent", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });
  it("changes when content changes", () => {
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe("syncMeta", () => {
  it("stamps schema version, source, and a content hash", () => {
    const meta = syncMeta({ title: "x" }, "cli");
    expect(meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(meta.source).toBe("cli");
    expect(meta.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("schema version helpers — migration tolerant", () => {
  it("treats a record without schemaVersion as version 0", () => {
    expect(readSchemaVersion({})).toBe(0);
    expect(needsUpgrade({})).toBe(true);
    expect(needsUpgrade({ schemaVersion: SCHEMA_VERSION })).toBe(false);
  });
});

describe("newProjectId", () => {
  it("produces unique ids", () => {
    expect(newProjectId()).not.toBe(newProjectId());
  });
});

describe("makeEntry attaches sync-ready metadata", () => {
  it("includes schemaVersion, source, and contentHash", () => {
    const entry = makeEntry({ type: "note", title: "hello" });
    expect(entry.schemaVersion).toBe(SCHEMA_VERSION);
    expect(entry.source).toBe("cli");
    expect(entry.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("honors an explicit source label", () => {
    const entry = makeEntry({ type: "bug", title: "x", source: "checkpoint" });
    expect(entry.source).toBe("checkpoint");
  });

  it("produces the same contentHash for the same meaningful content", () => {
    const a = makeEntry({ type: "note", title: "same", body: "b" });
    const b = makeEntry({ type: "note", title: "same", body: "b" });
    // ids/timestamps differ, but the content hash is stable
    expect(a.id).not.toBe(b.id);
    expect(a.contentHash).toBe(b.contentHash);
  });
});

describe("reading old data still works", () => {
  it("loads a pre-metadata entry and lets new writes carry metadata", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);

    // Legacy entry with no sync metadata at all.
    const legacy: KnowledgeEntry = {
      id: "k_old",
      type: "note",
      title: "legacy note",
      body: "",
      status: "active",
      tags: [],
      entities: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    await saveEntries(p, [legacy]);

    // Reads fine.
    const loaded = await loadEntries(p);
    expect(loaded[0].id).toBe("k_old");
    expect(needsUpgrade(loaded[0])).toBe(true);

    // New entry written alongside carries metadata.
    await addEntry(p, { type: "note", title: "fresh note" });
    const after = await loadEntries(p);
    const fresh = after.find((e) => e.title === "fresh note")!;
    expect(fresh.schemaVersion).toBe(SCHEMA_VERSION);
    expect(needsUpgrade(fresh)).toBe(false);
  });

  it("loads an old config that lacks projectId/schemaVersion", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const oldConfig: ProjectConfig = { name: "Legacy", version: "0.2.0", createdAt: "2024-01-01T00:00:00.000Z" };
    await writeJson(p.config, oldConfig);
    const loaded = await loadConfig(p);
    expect(loaded?.name).toBe("Legacy");
    expect(loaded?.projectId).toBeUndefined();
    expect(needsUpgrade(loaded ?? {})).toBe(true);
  });
});
