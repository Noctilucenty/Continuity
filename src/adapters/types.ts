import { AgentTarget } from "../types";

/**
 * Model adapter layer (v2B #1).
 *
 * A handoff is the same project facts, reframed for whichever AI will read it.
 * The adapter abstraction keeps that framing OUT of the command and the
 * gathering logic: `core/handoffs.ts` builds one rich `HandoffContext`, and each
 * adapter decides what to emphasize and how to word it.
 *
 *   - Claude / Cursor have file access  -> point them at files, stay concise.
 *   - GPT / Gemini usually do not        -> inline reasoning and context.
 */

export interface DecisionBrief {
  title: string;
  reason?: string;
  alternatives?: string[];
  tradeoffs?: string;
}

export interface NextTaskBrief {
  title: string;
  detail?: string;
  source: string;
  priority: number;
}

export interface QueueItemBrief {
  title: string;
  status: string;
  source: string;
  priority: number;
}

/** Everything an adapter might want. Built once, rendered many ways. */
export interface HandoffContext {
  projectName: string;
  goal?: string;
  visionSummary: string;
  stateSummary: string;
  architectureSummary: string;
  latestCheckpointSummary: string | null;
  latestChanges: string[];
  blocker?: string;
  nextTask?: NextTaskBrief;
  topTasks: QueueItemBrief[];
  decisions: DecisionBrief[];
  risks: string[];
  knownBugs: string[];
}

export interface ModelAdapter {
  /** Canonical target id. */
  target: AgentTarget;
  /** Document title. */
  title: string;
  /** One line describing what this adapter optimizes for. */
  optimizesFor: string;
  /** Render the full handoff document for this target. */
  render(ctx: HandoffContext): string;
}
