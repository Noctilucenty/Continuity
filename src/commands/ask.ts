import pc from "picocolors";
import { requireProject, UserError } from "./_shared";
import { askQuestion, AskResult } from "../search/ask";
import { bump } from "../store/metrics";
import { copyOrPrint } from "../utils/clipboard";
import { hints, printHint } from "../utils/hints";
import { logger } from "../utils/logger";

/**
 * `continuity ask "<question>"` — deterministic, local Q&A over stored project
 * memory. Cites which sources it used and reports a confidence level. It never
 * pretends to know more than what's stored. With --copy, copies a clean answer.
 */
export async function ask(
  question: string | undefined,
  opts: { copy?: boolean } = {}
): Promise<void> {
  const p = await requireProject();

  if (!question || !question.trim()) {
    throw new UserError('Ask a question, e.g. continuity ask "why did we choose Polymarket?"');
  }

  const result = await askQuestion(p, question);
  await bump(p, "asks");

  logger.heading(`Q: ${result.question}`);

  if (!result.found) {
    printHint(hints.askNoResult());
    return;
  }

  if (opts.copy) {
    await copyOrPrint(plainAnswer(result), "answer");
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

/** A clean, plain-text answer (no color) suitable for the clipboard. */
function plainAnswer(result: AskResult): string {
  const lines = [`Q: ${result.question}`, ""];
  if (result.bestDecision) {
    const d = result.bestDecision;
    lines.push(`Decision: ${d.title}`);
    if (d.reason) lines.push(`Reason: ${d.reason}`);
    if (d.context) lines.push(`Context: ${d.context}`);
    if (d.alternatives?.length) lines.push(`Alternatives: ${d.alternatives.join("; ")}`);
    if (d.tradeoffs) lines.push(`Tradeoffs: ${d.tradeoffs}`);
    lines.push("");
  }
  lines.push("Sources used:");
  for (const s of result.sources) lines.push(`  - [${s.type}] ${s.label}`);
  lines.push("", `Confidence: ${result.confidence}`);
  return lines.join("\n");
}
