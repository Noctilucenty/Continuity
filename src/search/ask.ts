import { Paths, memoryFiles } from "../core/paths";
import { readMemory } from "../core/memory";
import { loadQueue } from "../core/tasks";
import { listCheckpoints } from "../core/checkpoints";
import { loadEntries, entryText } from "../core/knowledge";
import { KnowledgeEntry } from "../types";
import { truncate } from "../utils/format";

/**
 * Memory Search / Ask Foundation (v2B #6).
 *
 * Deterministic, local question answering over everything Continuity stores:
 * decisions, memory files, tasks, and checkpoints. There is NO external LLM
 * call — this is keyword overlap scoring with a confidence heuristic. The point
 * is honesty: it surfaces the most relevant stored entries and labels their
 * source, and it says plainly when it has no good answer rather than inventing
 * one. A model-backed answerer can layer on top of this later.
 */

export type SourceType = "decision" | "knowledge" | "memory" | "task" | "checkpoint";

export interface AnswerSource {
  type: SourceType;
  label: string;
  text: string;
  score: number;
}

export interface AskResult {
  question: string;
  found: boolean;
  confidence: "high" | "medium" | "low";
  bestDecision?: KnowledgeEntry;
  sources: AnswerSource[];
}

const QUESTION_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "it", "this", "that", "we", "our", "as",
  "at", "by", "from", "into", "than", "then", "so", "not", "no", "do", "did",
  "why", "what", "how", "when", "where", "who", "which", "should", "would",
  "could", "can", "will", "does", "you", "i", "us", "about", "use", "used",
]);

export async function askQuestion(p: Paths, question: string): Promise<AskResult> {
  const terms = tokenize(question);
  const normalized = question.trim().toLowerCase();

  const [memory, queue, checkpoints, entries] = await Promise.all([
    readMemory(p),
    loadQueue(p),
    listCheckpoints(p),
    loadEntries(p),
  ]);

  const candidates: (AnswerSource & { entry?: KnowledgeEntry })[] = [];

  // Knowledge entries (decisions, bugs, lessons, …).
  for (const e of entries) {
    const text = entryText(e);
    const score = scoreText(text, terms, normalized);
    if (score > 0) {
      candidates.push({
        type: e.type === "decision" ? "decision" : "knowledge",
        label: `${e.type}: ${e.title}`,
        text: truncate(e.reason || e.body || e.title, 200),
        score,
        entry: e,
      });
    }
  }

  // Memory files.
  for (const { name } of memoryFiles(p)) {
    const content = memory[name] ?? "";
    const score = scoreText(content, terms, normalized);
    if (score > 0) {
      candidates.push({
        type: "memory",
        label: `memory: ${name}`,
        text: truncate(meaningfulExcerpt(content, terms), 200),
        score,
      });
    }
  }

  // Tasks.
  for (const t of queue) {
    const score = scoreText(`${t.title} ${t.detail ?? ""}`, terms, normalized);
    if (score > 0) {
      candidates.push({ type: "task", label: `task: ${t.title}`, text: t.detail || t.title, score });
    }
  }

  // Checkpoints.
  for (const c of checkpoints) {
    const score = scoreText(c.summary, terms, normalized);
    if (score > 0) {
      candidates.push({ type: "checkpoint", label: `checkpoint: ${c.summary}`, text: c.summary, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const found = candidates.length > 0 && terms.length > 0;
  const bestDecision = candidates.find((c) => c.entry?.type === "decision")?.entry;
  const confidence = scoreConfidence(found, candidates, terms);

  return {
    question: question.trim(),
    found,
    confidence,
    bestDecision,
    sources: candidates.slice(0, 8).map(({ type, label, text, score }) => ({ type, label, text, score })),
  };
}

/* ---------- scoring ---------- */

function scoreText(text: string, terms: string[], normalizedQuery: string): number {
  if (!terms.length) return 0;
  const hay = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (hay.includes(term)) score += 1;
  }
  // Phrase bonus: the whole question appears verbatim.
  if (normalizedQuery.length > 3 && hay.includes(normalizedQuery)) score += 2;
  return score;
}

function scoreConfidence(
  found: boolean,
  candidates: { score: number }[],
  terms: string[]
): "high" | "medium" | "low" {
  if (!found || terms.length === 0) return "low";
  const top = candidates[0].score;
  // ratio of query terms the best source covers (cap at terms.length)
  const ratio = Math.min(top, terms.length) / terms.length;
  if (ratio >= 0.6 && top >= 2) return "high";
  if (ratio >= 0.34) return "medium";
  return "low";
}

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2 && !QUESTION_STOPWORDS.has(t))
    ),
  ];
}

/** Pull the lines of a memory file that actually mention the query terms. */
function meaningfulExcerpt(content: string, terms: string[]): string {
  const lines = content
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .filter((l) => terms.some((t) => l.toLowerCase().includes(t)));
  return lines.length ? lines.join(" ") : content.replace(/\n+/g, " ");
}
