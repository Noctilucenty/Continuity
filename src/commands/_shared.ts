import { paths, Paths } from "../core/paths";
import { isInitialized } from "../core/memory";

/** A typed error the CLI catches and prints cleanly (no stack trace). */
export class UserError extends Error {}

/**
 * Resolve project paths and guarantee the project is initialized. Every command
 * except `init` calls this first, so a half-set-up project produces a calm,
 * actionable message instead of a crash.
 */
export async function requireProject(): Promise<Paths> {
  const p = paths();
  if (!(await isInitialized(p))) {
    throw new UserError(
      "No Continuity project here. Run `continuity init` to create one."
    );
  }
  return p;
}
