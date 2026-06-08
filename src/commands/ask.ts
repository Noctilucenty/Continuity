import pc from "picocolors";
import { requireProject, UserError } from "./_shared";
import { askQuestion } from "../search/ask";
import { logger } from "../utils/logger";

/**
 * `continuity ask "<question>"` — deterministic, local Q&A over stored project
 * memory. Cites which sources it used and reports a confidence level. It never
 * pretends to know more than what's stored.
 */
export async function ask(question: string | undefined): Promise<void> {
  const p = await requireProject();

  if (!question || !question.trim()) {
    throw new UserError('Ask a question, e.g. continuity ask "why did we choose Polymarket?"');
  }

  const result = await askQuestion(p, question);

  logger.heading(`Q: ${result.question}`);

  if (!result.found) {
    logger.warn("No stored memory matches that question.");
    logger.dim("Continuity only answers from what you've recorded — it won't guess.");
    logger.line("");
    logger.info("Try recording context first:");
    logger.dim('  continuity decide --title "..." --reason "..."');
    logger.dim("  continuity checkpoint");
    logger.dim("  continuity recall \"<keywords>\"   (broader keyword search)");
    return;
  }

  // If a decision is the strongest match, answer it in full.
  if (result.bestDecision) {
    const d = result.bestDecision;
    logger.heading("Best matching decision");
    logger.line(`  ${pc.bold(d.title)}`);
    if (d.reason) logger.line(`  reason: ${d.reason}`);
    if (d.context) logger.line(`  context: ${d.context}`);
    if (d.alternatives?.length) logger.line(`  alternatives: ${d.alternatives.join("; ")}`);
    if (d.tradeoffs) logger.line(`  tradeoffs: ${d.tradeoffs}`);
  }

  logger.heading("Sources used");
  for (const s of result.sources) {
    logger.line(`  ${pc.dim(`[${s.type}]`)} ${s.label} ${pc.dim(`·${s.score}`)}`);
  }

  const color =
    result.confidence === "high" ? pc.green : result.confidence === "medium" ? pc.yellow : pc.dim;
  logger.line("");
  logger.line(`  Confidence: ${color(result.confidence)}`);
  if (result.confidence !== "high") {
    logger.dim("  (based on keyword match quality — record more context to improve answers)");
  }
  logger.line("");
}
