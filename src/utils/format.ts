import path from "path";

/** Short, friendly formatting helpers shared across commands. */

/** ISO timestamp for storage. */
export function now(): string {
  return new Date().toISOString();
}

/** A compact id like `t_lp3k9a2` — sortable-ish and human-skimmable. */
export function shortId(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${stamp}${rand}`;
}

/** "3 minutes ago" style relative time from an ISO string. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** A path relative to the current working directory, for display. */
export function relativePath(absolute: string): string {
  const rel = path.relative(process.cwd(), absolute);
  return rel === "" ? "." : rel;
}

/** Truncate to a max length with an ellipsis. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

/** Pluralize a count: pluralize(1, "task") -> "1 task". */
export function pluralize(count: number, noun: string, plural?: string): string {
  const word = count === 1 ? noun : plural ?? `${noun}s`;
  return `${count} ${word}`;
}
