import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { paths, Paths } from "../src/core/paths";

/**
 * Create a throwaway temp directory and return Continuity paths rooted there.
 * Core modules accept a `Paths` object explicitly, so tests never touch the
 * real cwd. Returns a cleanup function.
 */
export async function tmpProject(): Promise<{ p: Paths; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "continuity-test-"));
  const p = paths(dir);
  // The directories core modules write into; readJson/readText tolerate missing
  // files, so we only need the dirs that get written to.
  await fs.mkdir(p.memory.dir, { recursive: true });
  await fs.mkdir(p.tasks.dir, { recursive: true });
  await fs.mkdir(p.sessions.checkpoints, { recursive: true });
  await fs.mkdir(p.knowledge.dir, { recursive: true });
  await fs.mkdir(p.handoffs.dir, { recursive: true });
  return {
    p,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

/** Write a memory file's content (helper for planner/knowledge tests). */
export async function writeMemory(file: string, content: string): Promise<void> {
  await fs.writeFile(file, content, "utf8");
}
