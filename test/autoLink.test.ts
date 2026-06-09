import { describe, it, expect, afterEach } from "vitest";
import {
  buildEntityMatchers,
  findMentions,
  autoLinkAll,
  linkDecision,
} from "../src/knowledge/autoLink";
import {
  registerEntity,
  addEntry,
  loadRelations,
  loadEntities,
} from "../src/core/knowledge";
import { Entity } from "../src/types";
import { tmpProject, writeMemory } from "./helpers";

let cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.map((c) => c()));
  cleanups = [];
});

function entity(name: string, aliases: string[] = [], kind = "concept"): Entity {
  return { id: `e_${name.toLowerCase().replace(/\W+/g, "")}`, name, kind, aliases };
}

describe("buildEntityMatchers + findMentions", () => {
  const matchers = buildEntityMatchers([
    entity("Polymarket", ["polymkt"]),
    entity("Kalshi"),
    entity("liquidity engine"),
  ]);

  it("matches whole words case-insensitively", () => {
    expect(findMentions("We use POLYMARKET for odds", matchers)).toContain("e_polymarket");
    expect(findMentions("kalshi was rejected", matchers)).toContain("e_kalshi");
  });

  it("matches multi-word phrases", () => {
    expect(findMentions("the liquidity engine routes orders", matchers)).toContain("e_liquidityengine");
  });

  it("matches aliases", () => {
    expect(findMentions("polymkt feed", matchers)).toContain("e_polymarket");
  });

  it("does not match partial words", () => {
    // "Kalshing" should not match "Kalshi"
    expect(findMentions("kalshing around", matchers)).not.toContain("e_kalshi");
  });

  it("respects excludeId", () => {
    expect(findMentions("Polymarket and Kalshi", matchers, "e_polymarket")).toEqual(["e_kalshi"]);
  });

  it("ignores entities with too-short names", () => {
    const m = buildEntityMatchers([entity("A")]);
    expect(m).toHaveLength(0);
  });
});

describe("linkDecision", () => {
  it("links a new decision to mentioned entities and creates the decision node", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await registerEntity(p, "Polymarket");

    const { entry } = await addEntry(p, {
      type: "decision",
      title: "Build liquidity engine",
      reason: "Route orders across the Polymarket feed",
    });
    const linked = await linkDecision(p, entry);
    expect(linked).toEqual(["Polymarket"]);

    const relations = await loadRelations(p);
    expect(relations.some((r) => r.kind === "relates_to")).toBe(true);
    // the decision became an entity node
    const entities = await loadEntities(p);
    expect(entities.some((e) => e.kind === "decision" && e.name === "Build liquidity engine")).toBe(true);
  });

  it("returns nothing when no known entity is mentioned", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await registerEntity(p, "Polymarket");
    const { entry } = await addEntry(p, { type: "decision", title: "Pick a CSS framework" });
    expect(await linkDecision(p, entry)).toEqual([]);
  });
});

describe("autoLinkAll", () => {
  it("preview does not mutate; apply creates relates_to edges", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await registerEntity(p, "Polymarket");
    await registerEntity(p, "Kalshi");
    await addEntry(p, { type: "decision", title: "Use Polymarket over Kalshi", reason: "liquidity" });

    const preview = await autoLinkAll(p, { apply: false });
    expect(preview.proposed.length).toBeGreaterThan(0);
    expect(preview.applied).toBe(0);
    expect(await loadRelations(p)).toHaveLength(0); // nothing written

    const applied = await autoLinkAll(p, { apply: true });
    expect(applied.applied).toBeGreaterThan(0);
    expect((await loadRelations(p)).filter((r) => r.kind === "relates_to").length).toBeGreaterThan(0);
  });

  it("is idempotent — a second apply adds nothing", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await registerEntity(p, "Polymarket");
    await addEntry(p, { type: "decision", title: "Ship Polymarket integration" });

    await autoLinkAll(p, { apply: true });
    const second = await autoLinkAll(p, { apply: true });
    expect(second.applied).toBe(0);
  });

  it("links concept entities that co-occur in a memory line", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await registerEntity(p, "Polymarket");
    await registerEntity(p, "Kalshi");
    await writeMemory(p.memory.architecture, "# Architecture\n- Polymarket and Kalshi both expose REST APIs\n");

    const result = await autoLinkAll(p, { apply: true });
    expect(result.proposed.some((l) => l.source === "memory")).toBe(true);
    const rels = await loadRelations(p);
    expect(rels.some((r) => r.kind === "relates_to" && r.note?.includes("memory"))).toBe(true);
  });

  it("returns no proposals when there are no entities", async () => {
    const { p, cleanup } = await tmpProject();
    cleanups.push(cleanup);
    await addEntry(p, { type: "decision", title: "Some decision about things" });
    const result = await autoLinkAll(p, { apply: true });
    expect(result.proposed).toEqual([]);
    expect(result.applied).toBe(0);
  });
});
