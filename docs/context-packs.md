# Context packs

A context pack is a focused bundle of just the parts of a project that touch one
topic — assembled so you can paste it into an AI without dumping the entire
project (which blows the token budget).

## Usage

```bash
continuity pack auth
continuity pack frontend
continuity pack payments
continuity pack sync
continuity pack memory
continuity pack auth --save     # also write .continuity/packs/auth.md
```

## What a pack contains

- Pack title and project summary
- Topic summary (or a clear note when nothing matched)
- Relevant decisions (with reasoning)
- Relevant memories (matching lines from the memory files)
- Relevant tasks
- Relevant checkpoints
- Relevant files (paths in the repo whose name matches the topic)
- Known risks
- Recommended next steps
- A copy/paste prompt for an AI assistant

## How matching works

Deterministic, case-insensitive keyword matching — no embeddings, no external
calls. The topic is tokenized and matched against decisions/knowledge (via the
keyword index), memory file lines, task titles/details, checkpoint summaries, and
file paths.

### Fallback

If nothing matches the topic, the pack does not fail. It sets `matched = false`,
notes that no topic-specific entries were found, and falls back to general
project context (summary, top tasks, recent risks) so the output is still useful.

## Architecture

- `src/context/contextPack.ts` — `buildPack(paths, topic)` returns a structured
  `ContextPack`; `renderPack(pack)` turns it into markdown.
- `src/commands/pack.ts` — the CLI command.
- `src/repo/walk.ts` — the shared, ignore-aware file walker used for file
  matching.
