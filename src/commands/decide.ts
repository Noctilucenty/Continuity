import { requireProject } from "./_shared";
import { addEntry, addRelation, ensureEntity, updateEntry } from "../core/knowledge";
import { linkDecision } from "../knowledge/autoLink";
import { appendSection } from "../core/memory";
import { bump } from "../store/metrics";
import { ask, askMultiline } from "../utils/prompt";
import { logger } from "../utils/logger";
import { truncate } from "../utils/format";

interface DecideOpts {
  title?: string;
  reason?: string;
  context?: string;
  alternative?: string[];
  tradeoffs?: string;
  tag?: string[];
  file?: string[];
  /** "A over B" records a chose_over relation between two entities. */
  over?: string;
  /** Mark an existing decision (by id) as superseded by this new one. */
  supersedes?: string;
}

/**
 * Record a decision in the journal (v2B #5). Writes a typed entry to the
 * knowledge store AND mirrors a human-readable block into memory/decisions.md,
 * so "why did we do X?" is answerable by both `recall`/`decisions` and a human
 * reading the file. Supports richer fields: context, related files, tags, and
 * superseding a prior decision.
 */
export async function decide(opts: DecideOpts): Promise<void> {
  const p = await requireProject();

  const title = opts.title ?? (await ask("Decision (what did you decide?)", ""));
  if (!title || !title.trim()) {
    logger.warn("No decision text given — nothing recorded.");
    return;
  }

  const reason = opts.reason ?? (await ask("Reason (why?)", ""));
  const context = opts.context ?? (await ask("Context (optional)", ""));
  const alternatives = opts.alternative ?? (await askMultiline("Alternatives considered"));
  const tradeoffs = opts.tradeoffs ?? (await ask("Tradeoffs", ""));
  const tags = opts.tag ?? [];
  const relatedFiles = opts.file ?? [];

  const { entry } = await addEntry(p, {
    type: "decision",
    title: title.trim(),
    body: reason.trim(),
    reason: reason.trim() || undefined,
    context: context.trim() || undefined,
    alternatives,
    tradeoffs: tradeoffs.trim() || undefined,
    relatedFiles,
    tags,
    sourceFile: p.memory.decisions,
  });

  // Mirror into the human-readable decision log.
  const block = [
    `Decision: ${title.trim()}`,
    ...(reason ? [`Reason: ${reason.trim()}`] : []),
    ...(context ? [`Context: ${context.trim()}`] : []),
    ...(alternatives.length ? [`Alternatives: ${alternatives.join("; ")}`] : []),
    ...(tradeoffs ? [`Tradeoffs: ${tradeoffs.trim()}`] : []),
    ...(relatedFiles.length ? [`Files: ${relatedFiles.join(", ")}`] : []),
  ];
  await appendSection(p.memory.decisions, title.trim(), block);

  // Optionally supersede a prior decision.
  if (opts.supersedes) {
    const updated = await updateEntry(p, opts.supersedes, {
      status: "superseded",
      supersededBy: entry.id,
    });
    if (updated) {
      logger.dim(`  superseded prior decision ${opts.supersedes}`);
    } else {
      logger.warn(`  no decision found with id ${opts.supersedes} to supersede`);
    }
  }

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

  await bump(p, "decisions");

  // Auto-link this decision to any known entities it mentions.
  const linked = await linkDecision(p, entry);

  logger.success("Decision recorded.");
  logger.line(`  ${truncate(title.trim(), 90)}`);
  if (reason) logger.dim(`  reason: ${truncate(reason.trim(), 90)}`);
  if (linked.length) logger.dim(`  auto-linked to: ${linked.join(", ")}`);
  logger.line("");
  logger.info(`Searchable now: continuity recall "${firstWord(title)}"`);
  logger.dim(`Entry ${entry.id} · see all with: continuity decisions`);
}

function firstWord(s: string): string {
  return s.trim().split(/\s+/).slice(0, 2).join(" ");
}
