import { spawn } from "child_process";
import { logger } from "./logger";

/**
 * Clipboard support (v0.6).
 *
 * Copies clean text to the system clipboard using the platform's built-in tool
 * (no dependency): pbcopy (macOS), clip (Windows), xclip/xsel/wl-copy (Linux).
 *
 * Safety:
 *  - Uses `spawn` with an argument array and writes to stdin — no shell, so no
 *    injection risk regardless of clipboard content.
 *  - Strips ANSI escape codes before copying, so colored terminal output never
 *    ends up in the clipboard.
 *  - Never throws: a failure returns false and the caller falls back to printing.
 *  - The writer is injectable so tests don't touch the real clipboard.
 */

// ESC [ ... m, built from the escape char code so no literal control byte sits
// in the source. Matches SGR color sequences produced by picocolors.
const ANSI_RE = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export interface ClipboardCommand {
  cmd: string;
  args: string[];
}

/** The primary clipboard command for a platform (Linux has runtime fallbacks). */
export function clipboardCommand(platform: NodeJS.Platform): ClipboardCommand | null {
  if (platform === "darwin") return { cmd: "pbcopy", args: [] };
  if (platform === "win32") return { cmd: "clip", args: [] };
  if (platform === "linux") return { cmd: "xclip", args: ["-selection", "clipboard"] };
  return null;
}

const LINUX_FALLBACKS: ClipboardCommand[] = [
  { cmd: "xclip", args: ["-selection", "clipboard"] },
  { cmd: "xsel", args: ["--clipboard", "--input"] },
  { cmd: "wl-copy", args: [] },
];

export type SpawnWriter = (cmd: string, args: string[], input: string) => Promise<boolean>;

const defaultWriter: SpawnWriter = (cmd, args, input) =>
  new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.on("error", () => resolve(false));
      child.stdin.end(input);
    } catch {
      resolve(false);
    }
  });

/**
 * Copy text to the clipboard. Returns true on success, false on any failure.
 * Never throws.
 */
export async function copyToClipboard(
  text: string,
  opts: { platform?: NodeJS.Platform; writer?: SpawnWriter } = {}
): Promise<boolean> {
  const platform = opts.platform ?? process.platform;
  const writer = opts.writer ?? defaultWriter;
  const clean = stripAnsi(text);

  try {
    if (platform === "linux") {
      for (const c of LINUX_FALLBACKS) {
        if (await writer(c.cmd, c.args, clean)) return true;
      }
      return false;
    }
    const command = clipboardCommand(platform);
    if (!command) return false;
    return await writer(command.cmd, command.args, clean);
  } catch {
    return false;
  }
}

/**
 * Copy content and report it; on failure, print the content so the user can copy
 * it manually. Never throws.
 */
export async function copyOrPrint(content: string, label: string): Promise<void> {
  const ok = await copyToClipboard(content);
  if (ok) {
    logger.success(`Copied ${label} to clipboard.`);
  } else {
    logger.warn("Could not copy automatically. The content is printed below.");
    logger.line("");
    logger.line(stripAnsi(content));
  }
}
