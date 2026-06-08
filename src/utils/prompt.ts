import readline from "readline";

/**
 * Minimal interactive prompts for `init`, `checkpoint`, and `decide`.
 *
 * Continuity is often driven non-interactively (scripts, CI, piped input). When
 * there is no TTY we never block — we return the provided default so every
 * command stays scriptable.
 */

function interactive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function ask(question: string, fallback = ""): Promise<string> {
  if (!interactive()) return fallback;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const suffix = fallback ? ` (${fallback})` : "";
  const answer = await new Promise<string>((resolve) => {
    rl.question(`${question}${suffix}: `, (a) => resolve(a));
  });
  rl.close();

  const trimmed = answer.trim();
  return trimmed === "" ? fallback : trimmed;
}

export async function askMultiline(question: string): Promise<string[]> {
  if (!interactive()) return [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  process.stdout.write(`${question}\n  (one per line, blank line to finish)\n`);

  const lines: string[] = [];
  await new Promise<void>((resolve) => {
    rl.on("line", (line) => {
      if (line.trim() === "") {
        rl.close();
        return;
      }
      lines.push(line.trim());
    });
    rl.on("close", () => resolve());
  });

  return lines;
}
