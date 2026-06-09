# Changelog

All notable changes to Continuity are documented here. Each version below has a
matching tag and GitHub Release. Format follows Keep a Changelog; versions are
pre-1.0 and additive (the local-first, files-as-truth core never breaks).

## v0.10.0 — Interactive Terminal UI

Make Continuity usable without memorizing commands while keeping the CLI as the
source of truth.

- Bare `continuity` now opens a local full-screen terminal dashboard when run in
  an interactive TTY; pipes, scripts, and CI keep the plain home output.
- Added `continuity ui` as an explicit interactive dashboard entrypoint.
- Dashboard shows project state, completed/open tasks, next action, recent
  checkpoints, and action buttons for Next, Checkpoint, Handoff, Resume, Ask, and
  Pack.
- Actions delegate back to existing CLI commands and local services. No cloud,
  no accounts, no OpenAI/Anthropic APIs, and no SDK dependency.

## v0.9.1 — First published release

First version live on npm as `@noctilucenty/continuity`.

- Fixed the `bin` path to the canonical `dist/cli.js` (the `./dist/cli.js` form
  tripped npm's manifest normalization on publish). Guarantees the global
  `continuity` command links correctly from the published package.
- Published publicly to the npm registry.

## v0.9.0 — npm Publish Readiness

Get the package ready to publish to npm under a reserved name.

- Renamed the package to the scoped `@noctilucenty/continuity` (the bare name
  `continuity` was already taken on npm). The installed command stays
  `continuity` — only the package name is scoped.
- Added `publishConfig: { access: "public" }` so the scoped package publishes
  publicly.
- Verified with `npm publish --dry-run`: 72 files, ~75 kB, dist + docs + README +
  LICENSE only.
- Updated install docs/README for the scoped name (`npm i -g
  @noctilucenty/continuity`, `npx @noctilucenty/continuity`; command remains
  `continuity`).

Publishing itself is a manual step requiring npm auth:
`npm login` then `npm publish`.

## v0.8.0 — Agent Lifecycle

Make resume and checkpoint happen automatically inside AI coding agents.

- MCP stdio server (`continuity mcp`) exposing 8 tools: `continuity_resume`,
  `continuity_checkpoint`, `continuity_status`, `continuity_handoff`,
  `continuity_next`, `continuity_done`, `continuity_ask`, `continuity_recall`.
- `continuity agent install|status|uninstall --runner claude|codex|cursor|all`
  wires the runner's MCP config and instruction file (idempotent, with backups,
  non-clobbering).
- Extracted shared `core/checkpointService.ts` and `core/resumeService.ts` so the
  CLI and MCP run one path; added a console-free `src/service` layer.
- Continuity makes no model/API calls — it is a local tool provider; the agent is
  the intelligence. No autonomous execution, no cloud.

## v0.7.0 — Package & Install Polish

Make Continuity easy to install and distribute.

- Full npm metadata (repository, homepage, bugs, keywords, author), `bin`/`main`,
  Node 20+ engines.
- `files` allowlist, `prepublishOnly` (typecheck + build + test), `prepare`
  build hook; `pack:check` script.
- `scripts/verify-install.sh` (`verify:install`) packs a tarball, installs it in a
  clean temp project, and runs the installed bin end-to-end.
- Added LICENSE (MIT) and `docs/installation.md`.

## v0.6.0 — User-Friendly CLI Polish

Make the CLI obvious and friendly for new users.

- Bare `continuity` shows a dashboard with the next action (getting-started when
  outside a project); exits cleanly, no command wall.
- `--copy` on `handoff`, `resume`, `pack`, `ask` puts clean content on the
  clipboard (pbcopy/clip/xclip, ANSI stripped, graceful fallback).
- Post-init onboarding, grouped `--help`, friendly empty states.
- New `done` command to complete tasks.

## v0.5.0 — Entity Auto-Linking

Grow the knowledge graph automatically.

- `entity add`/`entity list` to register graph entities.
- `link [--apply]` plus auto-linking on `decide`: decisions and memory that
  mention known entities get `relates_to` edges without manual `--over`.

## v0.4.0 — Self-Improving Metrics

Track momentum and completion velocity.

- `metrics` command and a Momentum line in `status`/`review`.
- Tracks checkpoint/handoff/decision/ask/pack counts and task-completion velocity,
  all local.

## v0.3.0 — Intelligence Layer (v2B)

Don't re-explain your project to every AI.

- Model-specific handoffs (Claude / GPT / Cursor / Gemini / generic adapters).
- Context packs (`pack <topic>`), repository analysis (`analyze`).
- Git checkpoints (`checkpoint --from-git` / `--since`).
- Decision retrieval (`decisions`), local `ask`, sync-ready metadata.

## v0.2.0 — Local-first runtime

The first working version.

- Core loop: `init`, `status`, `plan`, `next`, `checkpoint`, `summarize`,
  `review`, `handoff`, `resume`, `recall`, `decide`, `graph`.
- Scored task graph, heuristic planner/reviewer, per-agent handoffs — all on
  local files with zero LLM dependency.
- Vitest test suite and GitHub Actions CI (Node 20 & 22).
