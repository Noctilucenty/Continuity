import { Paths, memoryFiles } from "./paths";
import { ProjectConfig } from "../types";
import { pathExists, readText, writeText, appendText, readJson } from "../utils/fs";
import { now } from "../utils/format";

/**
 * The memory layer: the human-readable markdown files under `.continuity/memory`.
 *
 * These files are the source of truth. The planner, reviewer, and knowledge
 * store all read from here. Nothing in Continuity overwrites your prose without
 * being asked — we append structured sections and let you edit freely.
 */

export async function isInitialized(p: Paths): Promise<boolean> {
  return pathExists(p.config);
}

export async function loadConfig(p: Paths): Promise<ProjectConfig | null> {
  if (!(await pathExists(p.config))) return null;
  return readJson<ProjectConfig | null>(p.config, null);
}

/** Read every memory file as a single map keyed by name. */
export async function readMemory(p: Paths): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const { name, file } of memoryFiles(p)) {
    out[name] = await readText(file, "");
  }
  return out;
}

/**
 * Extract list items ("- foo", "* foo", "1. foo") from a markdown body,
 * skipping placeholder/template lines. Used to turn memory into tasks and
 * knowledge entries — so a bug the reviewer sees is the same bug the planner
 * can schedule.
 */
export function extractListItems(markdown: string): string[] {
  return markdown
    .split("\n")
    .filter((line) => /^\s*([-*]|\d+\.)\s+/.test(line))
    .map((line) => line.replace(/^\s*([-*]|\d+\.)\s+/, "").trim())
    .filter((item) => item.length > 0)
    .filter((item) => !/^_.*_$/.test(item)) // skip _italic placeholder_ lines
    .filter((item) => !/^\(none/i.test(item)); // skip "(none yet)" placeholders
}

/** Append a timestamped section to a memory file. */
export async function appendSection(
  file: string,
  heading: string,
  lines: string[]
): Promise<void> {
  if (lines.length === 0) return;
  const block =
    `\n## ${heading}\n` +
    `_${now()}_\n\n` +
    lines.map((l) => `- ${l}`).join("\n") +
    "\n";
  await appendText(file, block);
}

/** Append a single freeform line under a file (used by the session log). */
export async function appendLine(file: string, line: string): Promise<void> {
  await appendText(file, line.endsWith("\n") ? line : line + "\n");
}

/** Overwrite a memory file's content wholesale (used by `init` scaffolding). */
export async function setMemory(file: string, content: string): Promise<void> {
  await writeText(file, content);
}
