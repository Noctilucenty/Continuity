import { describe, it, expect, afterEach } from "vitest";
import {
  addEntry,
  search,
  rebuild,
  loadEntries,
  addRelation,
  ensureEntity,
  loadRelations,
} from "../src/core/knowledge";
import { tmpProject, writeMemory } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

describe("addEntry", () => {
  it("adds an entry and indexes it for search", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const { entry, added } = await addEntry(p, {
      type: "decision",
      title: "Use Polymarket for odds",
      body: "deeper liquidity",
    });
    expect(added).toBe(true);
    expect(entry.id).toMatch(/^k_/);
    const hits = await search(p, "polymarket");
    expect(hits[0].entry.title).toBe("Use Polymarket for odds");
  });

  it("is idempotent on same type+title (no duplicates)", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "bug", title: "Reconnect drops" });
    const second = await addEntry(p, { type: "bug", title: "reconnect DROPS" });
    expect(second.added).toBe(false);
    expect(await loadEntries(p)).toHaveLength(1);
  });

  it("treats different types with same title as distinct", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "bug", title: "Flaky thing" });
    const d = await addEntry(p, { type: "decision", title: "Flaky thing" });
    expect(d.added).toBe(true);
    expect(await loadEntries(p)).toHaveLength(2);
  });
});

describe("search", () => {
  it("matches by prefix and substring fallback", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "note", title: "Prediction engine notes", body: "scoring logic" });
    expect((await search(p, "predict")).length).toBeGreaterThan(0); // prefix
    expect((await search(p, "scoring")).length).toBeGreaterThan(0); // body substring
  });

  it("returns nothing for an empty store or empty query", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    expect(await search(p, "anything")).toEqual([]);
    await addEntry(p, { type: "note", title: "x" });
    expect(await search(p, "   ")).toEqual([]);
  });
});

describe("rebuild — backfill + reindex", () => {
  it("backfills bug/decision/risk entries from markdown memory", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.bugs, "# Bugs\n- WS reconnect drops\n");
    await writeMemory(p.memory.decisions, "# Decisions\n- Poll every 5s\n");
    await writeMemory(p.memory.risks, "# Risks\n- Rate limits unknown\n");

    const { entries } = await rebuild(p);
    expect(entries).toBe(3);

    const all = await loadEntries(p);
    expect(all.map((e) => e.type).sort()).toEqual(["assumption", "bug", "decision"]);
    // searchable after rebuild
    expect((await search(p, "reconnect")).length).toBeGreaterThan(0);
  });

  it("is idempotent — running twice does not duplicate", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await writeMemory(p.memory.bugs, "# Bugs\n- Only bug\n");
    await rebuild(p);
    const after = await rebuild(p);
    expect(after.entries).toBe(1);
  });
});

describe("relations & entities", () => {
  it("creates entities once and records a chose_over relation", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    const a = await ensureEntity(p, "Polymarket");
    const aAgain = await ensureEntity(p, "polymarket"); // case-insensitive match
    expect(aAgain.id).toBe(a.id);
    const b = await ensureEntity(p, "Kalshi");
    const added = await addRelation(p, { from: a.id, to: b.id, kind: "chose_over" });
    expect(added).toBe(true);
    // duplicate relation is rejected
    expect(await addRelation(p, { from: a.id, to: b.id, kind: "chose_over" })).toBe(false);
    expect(await loadRelations(p)).toHaveLength(1);
  });
});
