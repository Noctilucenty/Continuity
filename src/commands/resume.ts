import { requireProject } from "./_shared";
import { loadConfig } from "../core/memory";
import { buildResumePrompt } from "../core/resumeService";
import { logger } from "../utils/logger";
import { copyOrPrint } from "../utils/clipboard";

/**
 * Print the single best prompt to restart work right now. With --raw, print only
 * the prompt (pipe-friendly); with --copy, put it on the clipboard.
 */
export async function resume(opts: { raw?: boolean; copy?: boolean }): Promise<void> {
  const p = await requireProject();
  const prompt = await buildResumePrompt(p);

  if (opts.raw) {
    process.stdout.write(prompt + "\n");
    return;
  }

  if (opts.copy) {
    await copyOrPrint(prompt, "resume prompt");
    return;
  }

  const name = (await loadConfig(p))?.name ?? "this project";
  logger.heading(`Resume · ${name}`);
  logger.line("```");
  logger.line(prompt);
  logger.line("```");
  logger.line("");
  logger.dim("Tip: `continuity resume --copy` copies the prompt to your clipboard.");
}
