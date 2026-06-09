# The user-friendly CLI

Continuity has many commands, but you only need a handful day to day. This guide
is the short version: type `continuity` and it tells you what to do next.

## The daily 5-command loop

```bash
continuity next                    # 1. what should I do right now?
# 2. do the work with your AI
continuity done                    # 3. finished that task
continuity checkpoint --from-git   # 4. save state from your git changes
continuity handoff --to claude --copy   # 5. brief the next AI (on your clipboard)
```

That is the whole rhythm. Everything else is there when you want it.

## Just type `continuity`

Running `continuity` with no arguments shows a friendly home screen:

- **Inside a project** — a short dashboard (project, state, task/checkpoint
  counts, last checkpoint) plus your single next action and the daily loop.
- **Outside a project** — a getting-started screen (init, plan, the daily loop).

It never dumps the full command list and always exits successfully. For the full
grouped command list, run `continuity --help`.

## Copy-paste handoff flow

The core pain Continuity removes is re-explaining your project to another AI. The
`--copy` flag makes that one step:

```bash
continuity handoff --to gpt --copy     # briefing -> clipboard, paste into GPT
continuity handoff --to claude --copy
continuity handoff --to cursor --copy
continuity handoff --to gemini --copy
continuity resume --copy               # the prompt to restart, on your clipboard
continuity pack memory --copy          # a focused context bundle
continuity ask "why did we pick X?" --copy
```

Run the command, paste into the AI, keep working. Clipboard support uses your
platform's built-in tool (pbcopy / clip / xclip) — if it ever fails, the content
is printed so you can copy it manually.

## When to use which command

- **`ask "<question>"`** — you want an answer from what's already recorded
  ("why did we choose Polymarket?"). It answers from stored memory only, cites
  its sources, and tells you its confidence. It never guesses.
- **`pack <topic>`** — you're about to work on one area (auth, payments, sync)
  and want just that slice of context to hand an AI.
- **`analyze`** — you want a health check of the repository itself: untested
  files, TODO/FIXME markers, large files, docs gaps, CI presence.

## Friendly empty states

When there's nothing yet, every command points you at the next step — no active
tasks suggests `plan`, no decisions suggests `decide`, no entities suggests
`entity add`, and a question with no answer says so honestly.

## Why the interactive wizard comes later

A guided wizard should wrap a workflow that is already smooth. This release makes
the everyday commands obvious, fast, and friendly first; the wizard will sit on
top of that foundation in a later release.
