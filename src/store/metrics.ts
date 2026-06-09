import { Paths } from "../core/paths";
import { readJson, writeJson } from "../utils/fs";
import { now } from "../utils/format";
import { SCHEMA_VERSION } from "./metadata";

/**
 * Self-improving metrics (v0.4).
 *
 * Lightweight, local usage signal: how often each command runs and how fast
 * tasks get completed. This is the raw material a future model-backed execution
 * layer will use to tune itself — for now it just surfaces momentum in `status`,
 * `review`, and `metrics`.
 *
 * Best-effort by design: recording a metric must NEVER break a real command, so
 * the mutators swallow their own errors. Reading is migration-tolerant — an
 * older project with no metrics file simply starts from zero.
 */

export type MetricCounter =
  | "checkpoints"
  | "handoffs"
  | "decisions"
  | "packs"
  | "asks"
  | "tasksCreated"
  | "tasksCompleted";

export interface Metrics {
  schemaVersion: number;
  counters: Record<MetricCounter, number>;
  handoffsByTarget: Record<string, number>;
  /** ISO timestamps of task completions, capped (most recent kept). */
  completions: string[];
  createdAt: string;
  updatedAt: string;
}

const COMPLETIONS_CAP = 500;

const COUNTER_KEYS: MetricCounter[] = [
  "checkpoints",
  "handoffs",
  "decisions",
  "packs",
  "asks",
  "tasksCreated",
  "tasksCompleted",
];

export function defaultMetrics(): Metrics {
  const ts = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    counters: {
      checkpoints: 0,
      handoffs: 0,
      decisions: 0,
      packs: 0,
      asks: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
    },
    handoffsByTarget: {},
    completions: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Load metrics, merging defaults so a partial/old file reads cleanly. */
export async function loadMetrics(p: Paths): Promise<Metrics> {
  const raw = await readJson<Partial<Metrics>>(p.metrics, {});
  const base = defaultMetrics();
  return {
    schemaVersion: raw.schemaVersion ?? base.schemaVersion,
    counters: { ...base.counters, ...(raw.counters ?? {}) },
    handoffsByTarget: { ...base.handoffsByTarget, ...(raw.handoffsByTarget ?? {}) },
    completions: Array.isArray(raw.completions) ? raw.completions : [],
    createdAt: raw.createdAt ?? base.createdAt,
    updatedAt: raw.updatedAt ?? base.updatedAt,
  };
}

export async function saveMetrics(p: Paths, m: Metrics): Promise<void> {
  await writeJson(p.metrics, { ...m, updatedAt: now() });
}

/**
 * Increment a counter (best-effort; never throws). Pass `target` to also bump
 * the per-target handoff breakdown.
 */
export async function bump(
  p: Paths,
  counter: MetricCounter,
  by = 1,
  opts: { target?: string } = {}
): Promise<void> {
  try {
    const m = await loadMetrics(p);
    m.counters[counter] = (m.counters[counter] ?? 0) + by;
    if (opts.target) {
      m.handoffsByTarget[opts.target] = (m.handoffsByTarget[opts.target] ?? 0) + by;
    }
    await saveMetrics(p, m);
  } catch {
    // metrics are non-critical — swallow
  }
}

/** Record a task completion (best-effort; never throws). Bumps tasksCompleted. */
export async function recordCompletion(p: Paths, when: string = now()): Promise<void> {
  try {
    const m = await loadMetrics(p);
    m.counters.tasksCompleted += 1;
    m.completions.push(when);
    if (m.completions.length > COMPLETIONS_CAP) {
      m.completions = m.completions.slice(-COMPLETIONS_CAP);
    }
    await saveMetrics(p, m);
  } catch {
    // non-critical
  }
}

export interface Velocity {
  total: number;
  last7Days: number;
  perDay7: number;
}

/** Completion velocity derived from the completion timestamps. */
export function velocity(m: Metrics, reference: number = Date.now()): Velocity {
  const weekAgo = reference - 7 * 24 * 60 * 60 * 1000;
  const last7Days = m.completions.filter((iso) => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= weekAgo && t <= reference;
  }).length;
  return {
    total: m.counters.tasksCompleted,
    last7Days,
    perDay7: Math.round((last7Days / 7) * 10) / 10,
  };
}

/** Human-readable summary lines for display in status/metrics. */
export function summarizeMetrics(m: Metrics): string[] {
  const v = velocity(m);
  return [
    `checkpoints: ${m.counters.checkpoints}`,
    `handoffs: ${m.counters.handoffs}`,
    `decisions: ${m.counters.decisions}`,
    `asks: ${m.counters.asks}`,
    `packs: ${m.counters.packs}`,
    `tasks completed: ${v.total} (${v.last7Days} in last 7d, ~${v.perDay7}/day)`,
  ];
}

export { COUNTER_KEYS };
