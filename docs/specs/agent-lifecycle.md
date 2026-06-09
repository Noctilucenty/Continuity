# Continuity — Agent Lifecycle (MCP Server + Hooks)

Status: proposed (not started)
Theme: make `resume` and `checkpoint` happen automatically inside AI coding
agents, so continuity is zero-effort. This closes the gap with AICTX's
agent-driven lifecycle while building on Continuity's existing local-first core.

## Why

Today Continuity's loop is human-driven: the user remembers to run `next`,
`done`, `checkpoint`, `handoff`. The biggest friction-removal — and the thing
AICTX does that Continuity does not — is letting the **agent** run the lifecycle:
load context at session start, save a checkpoint before stopping. This serves the
core promise ("your work shouldn't stop because your AI did") by removing the
manual step entirely.

Continuity becomes a **local tool provider** the agent drives. The connected
agent (Claude Code / Codex / Cursor) is the LLM; Continuity makes no model calls.

## Invariants (must not break)

- No external AI / LLM API calls from Continuity. It exposes tools; the agent is
  the intelligence.
- No autonomous execution. The agent acts; the human supervises.
- No cloud sync. Local-first, files-as-truth preserved.
- Deterministic, testable, offline. Existing 170 tests stay green.

## Build order

1. Service layer (console-free, structured)
2. MCP server (stdio) exposing Continuity tools
3. `continuity mcp` command
4. Agent hook installer (`continuity agent install/status/uninstall`)
5. Generated instruction files + MCP config (Claude Code / Codex / Cursor)
6. Tests
7. Documentation
8. Verification + CI

---

## 1. Service layer

MCP tools need structured returns, not logger output. Most logic already lives in
`core/` — extract the two pipelines that currently live inside command files so
both the CLI and MCP share them:

- Move the checkpoint creation pipeline out of `commands/checkpoint.ts` into
  `core/checkpointService.ts` (`createCheckpoint(p, input)` returning a result
  object: checkpoint id, file, tasks generated, next task, risks).
- Extract the resume-prompt builder out of `commands/resume.ts` into
  `core/resumeService.ts` (`buildResumePrompt(p)` returning the plain prompt).

Add a thin `src/service/index.ts` that returns plain strings/objects (no color),
reusing existing core:

- `resumeBrief(p)` -> resume prompt + next task + recent decisions + blockers
- `recordCheckpoint(p, input)` -> via `createCheckpoint`
- `statusSummary(p)` -> structured dashboard (reuse `gatherHome`)
- `handoffDoc(p, target)` -> `generateHandoff`
- `nextTask(p)` / `completeTask(p, id)` -> existing `tasks` core
- `answer(p, question)` -> `askQuestion`; `recall(p, query)` -> `search`

Requirement: services never call `logger`; they return data. CLI commands keep
their console formatting by calling services then printing.

## 2. MCP server

`src/mcp/server.ts` using `@modelcontextprotocol/sdk` (stdio transport, zod input
schemas). Tools:

| Tool | Args | Returns |
|---|---|---|
| `continuity_resume` | `{ root? }` | The resume brief: what was in progress, next task, recent decisions, blockers |
| `continuity_checkpoint` | `{ root?, summary, changed?[], files?[], decisions?[], failures?[], next?, blocker? }` | Confirmation + next task |
| `continuity_status` | `{ root? }` | Dashboard summary |
| `continuity_handoff` | `{ root?, to }` | The model-specific handoff document |
| `continuity_next` | `{ root? }` | The current highest-leverage task |
| `continuity_done` | `{ root?, taskId? }` | Completes a task; returns the next |
| `continuity_ask` | `{ root?, question }` | Deterministic answer + sources + confidence |
| `continuity_recall` | `{ root?, query }` | Matching memory/decisions |

Requirements:
- `root` defaults to the server's cwd; resolve via `paths(root)`.
- Tolerate an uninitialized project: return guidance text, never throw.
- All output is plain text (no ANSI).
- Local files only; no network. Validate inputs with zod.
- Factor each tool's logic into a plain async handler `({ root, args }) => result`
  so handlers are unit-testable without a live stdio transport.

## 3. `continuity mcp` command

`continuity mcp [--root <path>]` starts the stdio MCP server (this is what agents
launch). Register in the CLI under an "Advanced" help group. Keep it out of the
everyday/home surfaces.

## 4. Agent hook installer

`continuity agent install [--runner claude|codex|cursor|all]` (default: detect /
all). Scaffolds, idempotently and without clobbering user content:

- **MCP config** — add a `continuity` server entry:
  - Claude Code: merge into `.mcp.json` (`command: "continuity", args: ["mcp"]`,
    or `npx -y continuity mcp` when not globally installed).
  - Cursor: merge into `.cursor/mcp.json`.
  - Codex: the runner's documented MCP config location.
- **Instruction block** — append a delimited Continuity lifecycle block to
  `CLAUDE.md` (Claude), `AGENTS.md` (Codex), and `.cursor/rules/continuity.md`
  (Cursor). Use markers (`<!-- continuity:start -->` / `<!-- continuity:end -->`)
  so re-running replaces the block instead of duplicating.

Also: `continuity agent status` (what's installed) and `continuity agent
uninstall` (remove the blocks + server entry; never touch surrounding content).

Requirements:
- JSON merges must preserve existing servers/keys; write a `.bak` before editing.
- Markdown blocks are delimited and idempotent.
- Works on Windows paths.

## 5. Instruction content

Concise, no emoji, e.g.:

```
<!-- continuity:start -->
## Continuity lifecycle (managed by Continuity)
This repository uses Continuity for cross-session continuity.
- At the start of a session, call the `continuity_resume` tool to load what was
  in progress and the next task.
- Before you stop, hit a limit, or finish a task, call `continuity_checkpoint`
  with: a one-line summary, files changed, decisions made, failures hit, and the
  next action.
- Respect prior decisions returned by resume; do not re-litigate them.
If the MCP tools are unavailable, run the equivalent CLI: `continuity resume`
and `continuity checkpoint`.
<!-- continuity:end -->
```

## 6. Tests

- Service layer: `resumeBrief`, `recordCheckpoint`, `statusSummary` return correct
  structured data against a `tmpProject`.
- MCP handlers: call each tool handler directly; assert ANSI-free output, correct
  behavior, and graceful handling of an uninitialized project. (No live transport
  needed.)
- Hook installer: install writes/merges `.mcp.json` + instruction block; running
  twice yields exactly one block (idempotent); install preserves pre-existing
  `.mcp.json` keys and surrounding CLAUDE.md content; uninstall removes only the
  managed block; a `.bak` is written.
- Regression: existing checkpoint/resume command behavior unchanged after the
  service extraction.

## 7. Documentation

- `docs/agent-lifecycle.md`: what it is, per-runner install, the lifecycle, the
  MCP tool reference, local-first/security notes, troubleshooting.
- README: an "Automatic mode (MCP)" section.

## 8. Verification + CI

- `npm run typecheck && npm run build && npm test && npm run pack:check`.
- Smoke: start `continuity mcp`, perform an MCP `initialize` + `tools/list`
  handshake (via the SDK client in a test or a piped JSON-RPC script); call
  `continuity_resume` and `continuity_checkpoint` against a temp project.
- `continuity agent install` in a temp dir produces a valid `.mcp.json` and a
  delimited CLAUDE.md block; re-run is idempotent.
- Confirm `dist` ships the MCP server; pack allowlist unchanged; bin unaffected.
- CI green on Node 20 and 22 (verify `@modelcontextprotocol/sdk` supports both).

## New dependency

Adds `@modelcontextprotocol/sdk` (and `zod`, which it uses for schemas). This is
the one new runtime dependency — justified for a standards-compliant MCP server.
Everything else stays local and dependency-light.

## Acceptance criteria

- `continuity mcp` runs a stdio MCP server exposing the tools above.
- Tools return correct, deterministic, ANSI-free data and touch local files only.
- `continuity agent install --runner claude` makes Claude Code auto-load resume at
  session start and checkpoint before stopping (config + instructions present,
  idempotent, non-clobbering); same for codex (`AGENTS.md`) and cursor.
- No external API calls; no autonomous execution; local-first preserved.
- All tests pass; CI green on Node 20 and 22.

## Honest limitations

- The agent calling `continuity_checkpoint` is driven by instruction, not
  enforcement — same constraint AICTX has. Mitigate with strong, concise
  instructions and trivially-callable tools. Document this plainly.

## Roadmap placement

Recommended: this is **v0.8 Agent Lifecycle** (highest leverage — it's the
differentiator that makes continuity zero-effort). Keep **npm publish** as a small
parallel task (mostly blocked on the package-name decision) and the **interactive
wizard last**. Alternative ordering: npm publish first if distribution matters
more than the automatic loop.
