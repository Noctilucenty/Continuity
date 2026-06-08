import { Paths } from "./paths";
import { Checkpoint } from "../types";
import { writeText, readText, appendText } from "../utils/fs";
import { now, shortId, relativeTime } from "../utils/format";
import path from "path";

/**
 * Checkpoints are the heartbeat of Continuity: a durable record of what changed,
 * what worked, what failed, the current blocker, and the next move. Each one is
 * written as its own markdown file (easy to read, easy to diff) plus a one-line
 * entry in the session log.
 */

export function makeCheckpoint(
  data: Omit<Checkpoint, "id" | "createdAt">
): Checkpoint {
  return { id: shortId("cp"), createdAt: now(), ...data };
}

export async function writeCheckpoint(p: Paths, cp: Checkpoint): Promise<string> {
  const file = path.join(p.sessions.checkpoints, `${cp.id}.md`);
  await writeText(file, renderCheckpoint(cp));
  await appendText(
    p.sessions.log,
    `- [${cp.createdAt}] ${cp.summary} (${cp.id})\n`
  );
  return file;
}

export async function readLatestCheckpoint(p: Paths): Promise<Checkpoint | null> {
  const log = await readText(p.sessions.log, "");
  const ids = [...log.matchAll(/\((cp_[a-z0-9]+)\)/g)].map((m) => m[1]);
  const last = ids[ids.length - 1];
  if (!last) return null;
  return parseCheckpoint(p, last);
}

async function parseCheckpoint(p: Paths, id: string): Promise<Checkpoint | null> {
  const file = path.join(p.sessions.checkpoints, `${id}.md`);
  const md = await readText(file, "");
  if (!md) return null;

  const section = (heading: string): string[] => {
    const re = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
    const body = md.match(re)?.[1] ?? "";
    return body
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
      .filter(Boolean)
      .filter((l) => !/^_.*_$/.test(l)); // drop "_none_" placeholders
  };
  const single = (heading: string): string | undefined => section(heading)[0];

  return {
    id,
    createdAt: md.match(/_created (.+?)_/)?.[1] ?? now(),
    summary: single("Summary") ?? "",
    changed: section("What changed"),
    filesModified: section("Files modified"),
    worked: section("What worked"),
    failed: section("What failed"),
    blocker: single("Current blocker"),
    nextAction: single("Next best action"),
    suggestedPrompt: extractCodeBlock(md),
  };
}

function renderCheckpoint(cp: Checkpoint): string {
  const list = (items: string[]) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : "_none_";

  return [
    `# Checkpoint ${cp.id}`,
    `_created ${cp.createdAt}_`,
    "",
    `## Summary`,
    cp.summary || "_none_",
    "",
    `## What changed`,
    list(cp.changed),
    "",
    `## Files modified`,
    list(cp.filesModified),
    "",
    `## What worked`,
    list(cp.worked),
    "",
    `## What failed`,
    list(cp.failed),
    "",
    `## Current blocker`,
    cp.blocker ? `- ${cp.blocker}` : "_none_",
    "",
    `## Next best action`,
    cp.nextAction ? `- ${cp.nextAction}` : "_none_",
    "",
    `## Suggested prompt for the next AI`,
    "```",
    cp.suggestedPrompt ?? "Continue from the next best action above.",
    "```",
    "",
  ].join("\n");
}

function extractCodeBlock(md: string): string | undefined {
  const m = md.match(/## Suggested prompt[^\n]*\n```\n([\s\S]*?)\n```/);
  return m?.[1]?.trim() || undefined;
}

/** Human label for the most recent checkpoint time, for the status view. */
export function checkpointAge(cp: Checkpoint | null): string {
  return cp ? relativeTime(cp.createdAt) : "never";
}
