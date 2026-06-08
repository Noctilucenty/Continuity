import { requireProject, UserError } from "./_shared";
import { buildPack, renderPack } from "../context/contextPack";
import { writeText } from "../utils/fs";
import { logger } from "../utils/logger";
import { relativePath } from "../utils/format";
import path from "path";

/**
 * `continuity pack <topic>` — generate a focused context bundle for one area of
 * the project, ready to paste into Claude/GPT/Cursor. Prints the pack; with
 * --save, also writes it to `.continuity/packs/<topic>.md`.
 */
export async function pack(
  topic: string | undefined,
  opts: { save?: boolean }
): Promise<void> {
  const p = await requireProject();

  if (!topic || !topic.trim()) {
    throw new UserError('A topic is required. Try: continuity pack auth');
  }

  const built = await buildPack(p, topic);
  const doc = renderPack(built);

  logger.line(doc);

  if (!built.matched) {
    logger.warn(`No topic-specific entries matched "${built.topic}" — showed general context.`);
  }

  if (opts.save) {
    const safe = built.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack";
    const file = path.join(p.root, "packs", `${safe}.md`);
    await writeText(file, doc);
    logger.info(`Saved pack to ${relativePath(file)}`);
  }
}
