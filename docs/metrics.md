# Self-improving metrics

Continuity tracks lightweight local usage signal — how often each command runs
and how fast tasks get completed — so momentum is visible and a future
model-backed execution layer has data to tune itself with. There is no
telemetry: everything stays in `.continuity/metrics.json`.

## Commands

```bash
continuity done [taskId]   # mark a task complete (defaults to the next task)
continuity metrics         # show activity + task velocity
continuity metrics --json  # machine-readable
```

Metrics also appear inline:

- `continuity status` shows a **Momentum** line (completed total, last-7-day
  count, per-day rate, checkpoint count).
- `continuity review` includes a **Momentum** section with a nudge when no task
  has been completed this week.

## What's tracked

| Signal | Bumped by |
|--------|-----------|
| `checkpoints` | `checkpoint` |
| `handoffs` (+ per target) | `handoff` (explicit only — not the checkpoint auto-regen) |
| `decisions` | `decide` |
| `asks` | `ask` |
| `packs` | `pack` |
| `tasksCreated` | `plan`, `checkpoint` (generated tasks) |
| `tasksCompleted` + completion timestamps | `done` |

### Velocity

`done` records a completion timestamp. Velocity is the count of completions in
the trailing 7 days, plus a per-day average. Timestamps are capped at the most
recent 500.

## Design notes

- **Best-effort.** The mutators (`bump`, `recordCompletion`) swallow their own
  errors — recording a metric must never break a real command.
- **Migration-tolerant.** `loadMetrics` merges defaults over whatever is on disk,
  so an old project with no metrics file (or a partial one) reads cleanly and
  starts from zero.
- **The `done` command** moves a task from `task_queue.json` into
  `completed_tasks.json` via `completeTask` in `src/core/tasks.ts` (kept free of
  a metrics dependency); the command layer adds the metric and logging.

## Files

- `src/store/metrics.ts` — the metrics store, `velocity`, `summarizeMetrics`.
- `src/commands/done.ts`, `src/commands/metrics.ts` — the commands.
- `src/core/tasks.ts` — `completeTask`.
