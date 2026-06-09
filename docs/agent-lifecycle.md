# Agent lifecycle (MCP + hooks)

Continuity can run its own loop *inside* your AI coding agent, so you never have
to remember to resume or checkpoint. The agent loads context at the start of a
session and saves a checkpoint before it stops — automatically.

Continuity does this as a **local tool provider**: it exposes a Model Context
Protocol (MCP) server, and the connected agent (Claude Code, Codex, Cursor)
calls its tools. Continuity itself makes no model/API calls; the agent is the
intelligence. Everything stays local.

## Quick setup

From inside an initialized Continuity project:

```bash
continuity agent install            # wires Claude Code, Codex, and Cursor
# or target one:
continuity agent install --runner claude
continuity agent status
continuity agent uninstall
```

`install` does two things per runner, idempotently and without clobbering your
files (it writes a `.bak` before editing and uses delimited blocks):

1. Adds a `continuity` MCP server entry to the runner's MCP config
   (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor).
2. Appends a delimited lifecycle instruction block to the runner's instruction
   file (`CLAUDE.md`, `AGENTS.md`, or `.cursor/rules/continuity.md`).

Then just work normally. The agent runs the loop:

```
resume  ->  work  ->  checkpoint  ->  (next session) resume
```

## The MCP server

`continuity mcp` runs a stdio MCP server (JSON-RPC 2.0). Agents launch it via the
config entry above; you rarely run it by hand. Stdout is the protocol channel.

### Tools

| Tool | Purpose |
|---|---|
| `continuity_resume` | Load the next task, current state, recent decisions, blockers |
| `continuity_checkpoint` | Save state: `summary`, `changed[]`, `files[]`, `decisions[]`, `failures[]`, `next`, `blocker` |
| `continuity_status` | Compact project summary |
| `continuity_handoff` | Model-specific handoff (`to`: claude/gpt/cursor/gemini/generic) |
| `continuity_next` | The highest-leverage next task |
| `continuity_done` | Mark a task complete (`taskId?`) |
| `continuity_ask` | Answer from stored memory (`question`) |
| `continuity_recall` | Keyword search (`query`) |

Every tool takes an optional `root` (defaults to the server's working
directory), returns plain text (no terminal colors), touches only local files,
and degrades gracefully on an uninitialized project instead of erroring.

## Codex note

Codex reads `AGENTS.md` for instructions, but configures MCP servers globally
(in its `config.toml`), not per-repo. `continuity agent install --runner codex`
writes the `AGENTS.md` lifecycle block; add the MCP server to your global Codex
config:

```toml
[mcp_servers.continuity]
command = "continuity"
args = ["mcp"]
```

If MCP is unavailable, the instruction block tells the agent to use the CLI
fallback (`continuity resume` / `continuity checkpoint`), so the loop still works.

## Design and limits

- **Local-first:** no cloud, no external API calls, no autonomous execution. The
  agent acts; you supervise.
- **Honest limitation:** the agent calling `continuity_checkpoint` is driven by
  instruction, not enforced. The instruction is concise and the tools are
  trivial to call, but an agent can still skip them. The manual CLI loop remains
  the reliable fallback.
- **Dependency-free server:** the MCP server is hand-rolled (newline-delimited
  JSON-RPC) to keep Continuity CommonJS and dependency-light.
