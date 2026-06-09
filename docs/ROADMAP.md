# Continuity roadmap

The guiding rule: **the local-first, files-as-truth core never breaks.** Every
item below is an *additive seam* — it layers on top of plain files and degrades
gracefully when its optional dependency (a model, an API key, a network) is
absent.

## Shipped

### v1 — the runtime
The full loop: `init -> plan -> next -> checkpoint -> review -> handoff -> resume`.
Heuristic planner and reviewer, scored task graph, per-agent handoffs, all on
local files with zero LLM dependency.

### v2A — memory & knowledge (current)
A typed, queryable knowledge store beside the markdown:
- **Decision journal** — `continuity decide` records decision / reason /
  alternatives / tradeoffs, mirrored into `memory/decisions.md`.
- **Recall** — `continuity recall "<query>"` keyword-searches entries via an
  inverted index, with a substring fallback. `--rebuild` backfills from markdown.
- **Knowledge graph** — `continuity graph` renders entities and relations
  (`chose_over`, `depends_on`, …) as a tree; `--json` for tooling.
- **Compression** — `continuity summarize` produces a template-based digest.

## Next

### v2A finish-out
- **Gemini-specific tuning** of the handoff profile (the target already exists).
- **Self-improving metrics (#8)** — track prompt/agent/completion stats in
  `knowledge/metrics.json` to inform future task ordering.
- **Entity auto-linking** — detect known entity names in entry text and suggest
  `relates_to` edges, so the graph grows without manual `--over`.

### v2B — the agent layer (introduces the LLM, behind an adapter)
- **Model adapters** — a single `Adapter` interface (`complete()`, `embed()`) with
  implementations for Claude / GPT / Gemini. This is *the* seam: the heuristic
  planner/reviewer/summarizer each gain an optional model-backed path, chosen at
  runtime, falling back to heuristics when no key is present.
- **Autonomous mode (`continuity run`)** — loop: pick next task -> execute via the
  active adapter -> checkpoint -> review -> generate next -> repeat until blocked. The
  human becomes supervisor.
- **Multi-agent orchestration** — Planner / Builder / Reviewer / Research / Memory
  roles operating independently but sharing one Continuity memory.

## Future architecture notes

Each is optional and slots onto the existing files without changing their meaning:

- **SQLite memory index** — swap the JSON `index.json` for a SQLite FTS index when
  entry counts get large. The markdown stays truth; SQLite is just a faster index.
- **Embeddings search** — add a vector column alongside the keyword index so
  `recall` does semantic match. Needs an `embed()` adapter; keyword search remains
  the offline fallback.
- **Git diff integration** — auto-populate a checkpoint's "files modified" and
  "what changed" from `git diff --stat` since the last checkpoint.
- **Automatic token-limit detection** — a wrapper that watches an agent session and
  fires `continuity checkpoint` + `handoff` automatically as limits approach.
- **Web dashboard** — read-only view over `.continuity/` (tasks, graph, timeline).
- **Background scheduler** — periodic `review` that surfaces starving tasks.
- **GitHub integration** — sync tasks to issues, checkpoints to PR descriptions.
- **VS Code extension** — the status dashboard and `next`/`checkpoint` in the
  sidebar.
