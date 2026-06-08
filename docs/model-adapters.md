# Model adapters

Continuity generates a different handoff document for each target AI, because
each tool reads context differently. The same project facts are gathered once,
then reframed per target.

## Usage

```bash
continuity handoff --to claude
continuity handoff --to gpt
continuity handoff --to cursor
continuity handoff --to gemini
continuity handoff --to generic
continuity handoff --to gpt --print   # print instead of just saving
```

Output is written to `.continuity/handoffs/<target>.md` and is structured so it
can be pasted directly into the target tool.

### Target normalization

Targets are case-insensitive and accept common aliases:

| You type | Normalizes to |
|----------|---------------|
| `claude`, `claude-code`, `anthropic` | `claude` |
| `gpt`, `chatgpt`, `openai`, `gpt-4` | `gpt` |
| `cursor` | `cursor` |
| `gemini`, `google`, `bard` | `gemini` |
| `generic`, `default`, `any` | `generic` |

An unrecognized target produces a clear error rather than silently falling back
to generic — a silent fallback would hand you a generic document when you
explicitly asked for something specific (e.g. a typo like `claude-cdoe`).

## What each adapter emphasizes

| Target | Optimized for |
|--------|---------------|
| **claude** | Concise state, current task, constraints, relevant files, next step. Points at files (Claude can read them); avoids noise. |
| **gpt** | Broader context, the reasoning behind decisions, risks, options, a recommended direction. Inlines reasoning (GPT usually can't read files). |
| **cursor** | Codebase structure, files to inspect, implementation instructions, test commands, known bugs, the exact next coding task. |
| **gemini** | Large context bundle: long-form overview, architecture, decisions and tradeoffs. |
| **generic** | Balanced and simple — paste anywhere. |

Every adapter always includes: project summary, current state, risks/blockers,
the next action, and a paste-ready "prompt to continue".

## Architecture

- `src/adapters/types.ts` — `HandoffContext` (the gathered facts) and the
  `ModelAdapter` interface.
- `src/adapters/modelAdapters.ts` — the five adapters, shared section builders,
  `normalizeTarget`, `getAdapter`, `allAdapters`.
- `src/core/handoffs.ts` — gathers the context once (`buildHandoffContext`) and
  delegates rendering to the adapters. It contains no wording.

To add a new target: add it to `AgentTarget`/`AGENT_TARGETS` in `src/types.ts`,
add a path in `src/core/paths.ts`, and add an adapter object. The command needs
no change.
