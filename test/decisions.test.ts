import { describe, it, expect, afterEach } from "vitest";
import { filterDecisions, loadDecisions, isActive, formatDecision } from "../src/knowledge/decisions";
import { addEntry, updateEntry, saveEntries } from "../src/core/knowledge";
import { KnowledgeEntry } from "../src/types";
import { tmpProject } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("isActive — migration tolerant", () => {
  it("treats a bare old entry (no status field) as active", () => {
    const old = { id: "k_1", type: "decision", title: "x", body: "", tags: [], entities: [], createdAt: "", updatedAt: "" } as unknown as KnowledgeEntry;
    expect(isActive(old)).toBe(true);
  });
  it("treats superseded entries as inactive", () => {
    const d = { status: "superseded", tags: [] } as unknown as KnowledgeEntry;
    expect(isActive(d)).toBe(false);
    const s = { status: "active", supersededBy: "k_9", tags: [] } as unknown as KnowledgeEntry;
    expect(isActive(s)).toBe(false);
  });
});

describe("filterDecisions", () => {
  it("returns only decision-type entries, newest first", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "bug", title: "a bug" });
    await addEntry(p, { type: "decision", title: "older", reason: "r1" });
    await new Promise((r) => setTimeout(r, 5));
    await addEntry(p, { type: "decision", title: "newer", reason: "r2" });

    const found = await filterDecisions(p, {});
    expect(found.map((d) => d.title)).toEqual(["newer", "older"]);
  });

  it("filters by tag (case-insensitive)", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "decision", title: "sync choice", tags: ["Sync"] });
    await addEntry(p, { type: "decision", title: "auth choice", tags: ["auth"] });

    const found = await filterDecisions(p, { tag: "sync" });
    expect(found.map((d) => d.title)).toEqual(["sync choice"]);
  });

  it("filters out superseded with --active", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const { entry: old } = await addEntry(p, { type: "decision", title: "v1 approach" });
    await addEntry(p, { type: "decision", title: "v2 approach" });
    await updateEntry(p, old.id, { status: "superseded", supersededBy: "k_new" });

    const active = await filterDecisions(p, { active: true });
    expect(active.map((d) => d.title)).toEqual(["v2 approach"]);
    const all = await filterDecisions(p, {});
    expect(all.length).toBe(2);
  });

  it("searches decisions by query", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "decision", title: "Use Polymarket", reason: "liquidity" });
    await addEntry(p, { type: "decision", title: "Use Postgres", reason: "relational" });

    const found = await filterDecisions(p, { search: "polymarket" });
    expect(found.length).toBe(1);
    expect(found[0].title).toBe("Use Polymarket");
  });
});

describe("new richer decisions", () => {
  it("persists context, related files, alternatives, tradeoffs, tags", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, {
      type: "decision",
      title: "Adopt event sourcing",
      reason: "auditability",
      context: "scaling the ledger",
      alternatives: ["CRUD", "CQRS-only"],
      tradeoffs: "more complexity",
      relatedFiles: ["src/ledger.ts"],
      tags: ["architecture"],
    });
    const [d] = await loadDecisions(p);
    expect(d.context).toBe("scaling the ledger");
    expect(d.relatedFiles).toEqual(["src/ledger.ts"]);
    expect(d.alternatives).toEqual(["CRUD", "CQRS-only"]);

    const out = formatDecision(d);
    expect(out).toContain("context: scaling the ledger");
    expect(out).toContain("files: src/ledger.ts");
    expect(out).toContain("tags: architecture");
  });
});

describe("backward compatibility with old decision entries", () => {
  it("reads and formats a minimal legacy entry without new fields", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    // Simulate a pre-v2B entry: no context/relatedFiles/schemaVersion.
    const legacy: KnowledgeEntry = {
      id: "k_legacy",
      type: "decision",
      title: "Chose REST over GraphQL",
      body: "simpler",
      status: "active",
      tags: [],
      entities: [],
      reason: "simpler",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    await saveEntries(p, [legacy]);

    const found = await filterDecisions(p, {});
    expect(found.length).toBe(1);
    const out = formatDecision(found[0]);
    expect(out).toContain("Chose REST over GraphQL");
    expect(out).toContain("reason: simpler");
    // no crash on missing optional fields
    expect(out).not.toContain("undefined");
  });
});
