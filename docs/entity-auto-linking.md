# Entity auto-linking

The knowledge graph used to grow only when you typed `decide --over`. Entity
auto-linking grows it automatically: it detects mentions of *known* entities in
your decisions and memory and adds `relates_to` edges — so related decisions and
concepts connect without manual wiring. That makes `pack` and `ask` richer,
because the graph reflects how things actually relate.

It is deterministic and offline: whole-word, case-insensitive matching of entity
names and aliases. No embeddings, no external calls.

## Usage

```bash
# 1. Register the concepts the graph should track
continuity entity add "Polymarket" --alias polymkt
continuity entity add "liquidity engine"
continuity entity list

# 2. Record decisions normally — they auto-link to mentioned entities
continuity decide --title "Build the liquidity engine on the Polymarket feed" \
  --reason "deeper liquidity"
#   -> auto-linked to: Polymarket, liquidity engine

# 3. Re-scan everything (existing decisions + memory)
continuity link            # preview proposed connections
continuity link --apply    # write them

continuity graph           # see the result
```

## What gets linked

- **Decision -> entity.** A decision whose text (title, reason, context,
  alternatives, tradeoffs) mentions a known entity gets a `relates_to` edge from
  the decision node to that entity. The decision becomes a graph node the first
  time it links to something.
- **Entity <-> entity (memory co-occurrence).** Two known entities mentioned on
  the same line of a memory file get linked to each other.

Edges are deduped symmetrically (an edge in either direction counts as existing),
so `link --apply` is idempotent.

## How matching works

For each entity, a whole-word/phrase matcher is built from its name plus
aliases, longest variant first (so "Polymarket API" wins over "Polymarket").
Matching ignores case and does not match partial words ("Kalshi" does not match
"Kalshing"). Names shorter than two characters are ignored to avoid noise.

## Where it runs

- `continuity decide` auto-links each new decision (applies immediately).
- `continuity link [--apply]` does a full re-scan of all decisions and memory.

## Architecture

- `src/knowledge/autoLink.ts` — `buildEntityMatchers`, `findMentions` (pure,
  unit-tested), plus `autoLinkAll` and `linkDecision`.
- `src/commands/entity.ts` — `entity add` / `entity list`.
- `src/commands/link.ts` — the `link` command.
- `src/core/knowledge.ts` — `registerEntity` (seed entities with aliases).
