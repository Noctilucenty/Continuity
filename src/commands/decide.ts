import { requireProject } from "./_shared";
import { addEntry, addRelation, ensureEntity } from "../core/knowledge";
import { appendSection } from "../core/memory";
import { ask, askMultiline } from "../utils/prompt";
import { logger } from "../utils/logger";
import { truncate } from "../utils/format";

interface DecideOpts {
  title?: string;
  reason?: string;
  alternative?: string[];
  tradeoffs?: string;
  tag?: string[];
  /** "A over B" records a chose_over relation between two entities. */
  over?: string;
}

/**
 * Record a decision in the journal (2A #6). Writes a typed entry to the
 * knowledge store AND appends a human-readable block to memory/decisions.md, so
 * "why did we do X?" is answerable by both `recall` and a human reading the file.
 */
export async function decide(opts: DecideOpts): Promise<void> {
  const p = await requireProject();

  const title = opts.title ?? (await ask("Decision (what did you decide?)", ""));
  if (!title || !title.trim()) {
    logger.warn("No decision text given — nothing recorded.");
    return;
  }

  const reason = opts.reason ?? (await ask("Reason (why?)", ""));
  const alternatives = opts.alternative ?? (await askMultiline("Alternatives considered"));
  const tradeoffs = opts.tradeoffs ?? (await ask("Tradeoffs", ""));
  const tags = opts.tag ?? [];

  const { entry } = await addEntry(p, {
    type: "decision",
    title: title.trim(),
    body: reason.trim(),
    reason: reason.trim() || undefined,
    alternatives,
    tradeoffs: tradeoffs.trim() || undefined,
    tags,
    sourceFile: p.memory.decisions,
  });

  // Mirror into the human-readable decision log.
  const block = [
    `Decision: ${title.trim()}`,
    ...(reason ? [`Reason: ${reason.trim()}`] : []),
    ...(alternatives.length ? [`Alternatives: ${alternatives.join("; ")}`] : []),
    ...(tradeoffs ? [`Tradeoffs: ${tradeoffs.trim()}`] : []),
  ];
  await appendSection(p.memory.decisions, title.trim(), block);

  // Optional "chose X over Y" relation for the graph.
  if (opts.over) {
    const chosen = await ensureEntity(p, title.trim(), "decision");
    const rejected = await ensureEntity(p, opts.over.trim());
    await addRelation(p, {
      from: chosen.id,
      to: rejected.id,
      kind: "chose_over",
      note: reason.trim() || undefined,
    });
  }

  logger.success("Decision recorded.");
  logger.line(`  ${truncate(title.trim(), 90)}`);
  if (reason) logger.dim(`  reason: ${truncate(reason.trim(), 90)}`);
  logger.line("");
  logger.info(`Searchable now: continuity recall "${firstWord(title)}"`);
  logger.dim(`Entry ${entry.id} · mirrored to ${"memory/decisions.md"}`);
}

function firstWord(s: string): string {
  return s.trim().split(/\s+/).slice(0, 2).join(" ");
}
