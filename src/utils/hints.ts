import { logger } from "./logger";

/**
 * Friendly empty-state hints (v0.6).
 *
 * Centralized so every "there's nothing here yet" message guides the user to the
 * exact next command, in one consistent voice. Each hint is plain text — no
 * emoji, no decorative symbols — and returns an array of lines so it's trivial
 * to assert in tests and to print.
 */

export const hints = {
  noTasks(): string[] {
    return [
      "No active tasks yet.",
      "Create a plan:",
      '  continuity plan "what you are building"',
    ];
  },

  noCheckpoints(): string[] {
    return [
      "No checkpoints yet.",
      "Save your current state:",
      "  continuity checkpoint --from-git",
    ];
  },

  noDecisions(): string[] {
    return [
      "No decisions recorded yet.",
      "Record one:",
      '  continuity decide "Use SQLite for local-first storage" --reason "Simple, portable, and reliable"',
    ];
  },

  noEntities(): string[] {
    return [
      "No entities yet.",
      "Add one:",
      '  continuity entity add "Polymarket" --alias "prediction markets"',
    ];
  },

  askNoResult(): string[] {
    return [
      "I could not find a confident answer in stored project memory.",
      "",
      "Try:",
      "  continuity checkpoint",
      '  continuity decide "..."',
      "  continuity pack memory",
    ];
  },
};

/** Print a hint block through the logger. */
export function printHint(lines: string[]): void {
  for (const line of lines) logger.line(line);
}
