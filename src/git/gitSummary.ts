import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Auto Checkpoint support (v2B #4).
 *
 * Safe, local, read-only git helpers. This module NEVER modifies git history,
 * commits, or touches the network — it only reads `git status` / `git diff` and
 * turns them into a deterministic change summary that the existing checkpoint
 * system records.
 *
 * The parsing is separated from the git invocation so the parsers can be unit
 * tested without a git repo.
 */

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

export interface GitChange {
  path: string;
  status: ChangeStatus;
}

export interface GitChangeSummary {
  files: GitChange[];
  counts: Record<ChangeStatus, number>;
  changeType: string;
  risks: string[];
  suggestedNext: string;
}

/* ---------- pure parsers (no git required) ---------- */

const PORCELAIN_MAP: Record<string, ChangeStatus> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "added",
};

/** Parse `git status --porcelain` output into changes. */
export function parsePorcelain(output: string): GitChange[] {
  const changes: GitChange[] = [];
  for (const raw of output.split("\n")) {
    if (!raw.trim()) continue;
    const xy = raw.slice(0, 2);
    const rest = raw.slice(3).trim();
    if (xy === "??") {
      changes.push({ path: rest, status: "untracked" });
      continue;
    }
    // Renames look like "old -> new"; record the new path.
    const path = rest.includes(" -> ") ? rest.split(" -> ")[1] : rest;
    const code = xy.trim()[0] ?? "M";
    changes.push({ path, status: PORCELAIN_MAP[code] ?? "modified" });
  }
  return dedupeByPath(changes);
}

/** Parse `git diff --name-status <ref>` output into changes. */
export function parseNameStatus(output: string): GitChange[] {
  const changes: GitChange[] = [];
  for (const raw of output.split("\n")) {
    if (!raw.trim()) continue;
    const parts = raw.split(/\t+/);
    const code = parts[0][0];
    // For renames (R100) the new path is the last column.
    const path = parts[parts.length - 1];
    changes.push({ path, status: PORCELAIN_MAP[code] ?? "modified" });
  }
  return dedupeByPath(changes);
}

/** Turn a set of changes into a deterministic, actionable summary. */
export function summarizeChanges(changes: GitChange[]): GitChangeSummary {
  const counts: Record<ChangeStatus, number> = {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
  };
  for (const c of changes) counts[c.status]++;

  return {
    files: changes,
    counts,
    changeType: classify(counts),
    risks: assessRisks(changes, counts),
    suggestedNext: suggestNext(changes, counts),
  };
}

/* ---------- git invocation ---------- */

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd }
    );
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

export async function getWorkingTreeChanges(cwd: string): Promise<GitChange[]> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return parsePorcelain(stdout);
}

export async function getDiffSince(cwd: string, ref: string): Promise<GitChange[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-status", ref],
    { cwd }
  );
  return parseNameStatus(stdout);
}

/* ---------- internals ---------- */

function dedupeByPath(changes: GitChange[]): GitChange[] {
  const byPath = new Map<string, GitChange>();
  for (const c of changes) byPath.set(c.path, c);
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function classify(counts: Record<ChangeStatus, number>): string {
  const total = sum(counts);
  if (total === 0) return "no changes";
  const additions = counts.added + counts.untracked;
  if (additions > 0 && counts.modified === 0 && counts.deleted === 0) return "new work / additions";
  if (counts.deleted > 0 && additions === 0 && counts.modified === 0) return "removals";
  if (counts.modified > 0 && additions === 0 && counts.deleted === 0) return "modifications";
  return "mixed changes";
}

function assessRisks(changes: GitChange[], counts: Record<ChangeStatus, number>): string[] {
  const risks: string[] = [];
  if (counts.deleted > 0) {
    risks.push(`${counts.deleted} file(s) deleted — confirm the removals are intentional.`);
  }
  const total = sum(counts);
  if (total > 20) {
    risks.push(`Large changeset (${total} files) — consider splitting into smaller commits.`);
  }
  if (changes.some((c) => /package(-lock)?\.json$|yarn\.lock$|pnpm-lock\.yaml$/.test(c.path))) {
    risks.push("Dependencies/lockfile changed — verify the build and lockfile are in sync.");
  }
  const sourceChanged = changes.some((c) => /\.[cm]?[jt]sx?$/.test(c.path) && !isTestPath(c.path));
  const testChanged = changes.some((c) => isTestPath(c.path));
  if (sourceChanged && !testChanged) {
    risks.push("Source changed without any test changes — add or update tests.");
  }
  return risks;
}

function suggestNext(changes: GitChange[], counts: Record<ChangeStatus, number>): string {
  if (sum(counts) === 0) return "Nothing to do — working tree is clean.";
  const testChanged = changes.some((c) => isTestPath(c.path));
  if (!testChanged) {
    return "Review the changed files, add/adjust tests, run the test suite, then commit.";
  }
  return "Run the test suite to confirm the changes, then commit.";
}

function isTestPath(p: string): boolean {
  const n = p.toLowerCase();
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(n) || /(^|\/)(tests?|__tests__)\//.test(n);
}

function sum(counts: Record<ChangeStatus, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
