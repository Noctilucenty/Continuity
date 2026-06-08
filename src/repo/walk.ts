import { promises as fs } from "fs";
import path from "path";

/**
 * A shared, ignore-aware recursive file walker. Used by Context Packs (to find
 * topic-relevant files) and Repository Intelligence (to analyze the tree).
 *
 * Deterministic: results are sorted by relative path so output never depends on
 * filesystem ordering.
 */

export const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "vendor",
  ".continuity",
  ".cache",
]);

/** Extensions we treat as binary / not worth scanning for text. */
export const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf",
  ".zip", ".gz", ".tar", ".tgz", ".rar", ".7z",
  ".mp3", ".mp4", ".mov", ".avi", ".wav", ".woff", ".woff2", ".ttf", ".eot",
  ".lock", ".bin", ".exe", ".dll", ".so", ".dylib", ".class", ".jar",
]);

export interface WalkedFile {
  abs: string;
  rel: string;
  size: number;
  ext: string;
}

export interface WalkOptions {
  ignoredDirs?: Set<string>;
}

export async function walkFiles(root: string, opts: WalkOptions = {}): Promise<WalkedFile[]> {
  const ignored = opts.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const out: WalkedFile[] = [];

  async function recurse(dir: string): Promise<void> {
    let entries: import("fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip rather than crash
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue; // avoid loops
      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        await recurse(abs);
      } else if (entry.isFile()) {
        let size = 0;
        try {
          size = (await fs.stat(abs)).size;
        } catch {
          continue;
        }
        out.push({
          abs,
          rel: path.relative(root, abs),
          size,
          ext: path.extname(entry.name).toLowerCase(),
        });
      }
    }
  }

  await recurse(root);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

export function isBinary(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

/** Read a file's text, returning "" if it's missing, too large, or binary. */
export async function readTextCapped(file: WalkedFile, maxBytes: number): Promise<string> {
  if (isBinary(file.ext) || file.size > maxBytes) return "";
  try {
    return await fs.readFile(file.abs, "utf8");
  } catch {
    return "";
  }
}
