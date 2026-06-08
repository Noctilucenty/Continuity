import pc from "picocolors";

/**
 * Terminal output for Continuity. The whole tool's job is to reduce anxiety
 * about lost context, so the voice here is calm, clear, and motivating —
 * never noisy.
 */

export const logger = {
  /** A plain line. */
  line(msg = ""): void {
    process.stdout.write(msg + "\n");
  },

  /** A successful action. */
  success(msg: string): void {
    this.line(`${pc.green("✓")} ${msg}`);
  },

  /** Neutral informational note. */
  info(msg: string): void {
    this.line(`${pc.cyan("›")} ${msg}`);
  },

  /** Something the user should notice but isn't an error. */
  warn(msg: string): void {
    this.line(`${pc.yellow("!")} ${msg}`);
  },

  /** A failure. Goes to stderr. */
  error(msg: string): void {
    process.stderr.write(`${pc.red("✗")} ${msg}\n`);
  },

  /** A section heading. */
  heading(msg: string): void {
    this.line("");
    this.line(pc.bold(msg));
  },

  /** Dim secondary text. */
  dim(msg: string): void {
    this.line(pc.dim(msg));
  },

  /** A key path or artifact the user may want to open. */
  artifact(label: string, path: string): void {
    this.line(`  ${pc.dim(label)} ${pc.underline(path)}`);
  },
};
