import { promises as fs } from "fs";
import path from "path";

/**
 * Thin, well-behaved filesystem helpers. Every read tolerates a missing file
 * by returning a fallback, so commands never crash on a half-initialized
 * project — they guide the user to `continuity init` instead.
 */

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readText(
  file: string,
  fallback = ""
): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

export async function writeText(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, content, "utf8");
}

export async function appendText(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.appendFile(file, content, "utf8");
}

/** Read JSON with a typed fallback if the file is missing or malformed. */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write JSON pretty-printed and newline-terminated (clean git diffs). */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
