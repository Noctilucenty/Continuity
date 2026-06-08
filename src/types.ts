/**
 * Shared types for the Continuity runtime.
 *
 * Continuity is local-first and files-as-truth: everything below is just a typed
 * view over JSON/markdown that lives in `.continuity/`. Deleting the on-disk
 * index never loses real data — the markdown memory is the source of record.
 */

export type AgentTarget = "claude" | "gpt" | "cursor" | "gemini" | "generic";

export const AGENT_TARGETS: AgentTarget[] = [
  "claude",
  "gpt",
  "cursor",
  "gemini",
  "generic",
];

/** Where a generated task came from. Drives priority scoring. */
export type TaskSource =
  | "bug"
  | "unfinished"
  | "risk"
  | "tests"
  | "manual"
  | "docs"
  | "improvement";

export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

export interface Task {
  id: string;
  title: string;
  detail?: string;
  source: TaskSource;
  status: TaskStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewTaskInput {
  title: string;
  detail?: string;
  source: TaskSource;
}

export interface Checkpoint {
  id: string;
  createdAt: string;
  summary: string;
  changed: string[];
  filesModified: string[];
  worked: string[];
  failed: string[];
  blocker?: string;
  nextAction?: string;
  suggestedPrompt?: string;
}

export interface ProjectConfig {
  name: string;
  version: string;
  createdAt: string;
  goal?: string;
}

/* ---------- 2A: knowledge store ---------- */

export type EntryType =
  | "decision"
  | "bug"
  | "lesson"
  | "assumption"
  | "preference"
  | "note";

export interface KnowledgeEntry {
  id: string;
  type: EntryType;
  title: string;
  body: string;
  status: string;
  tags: string[];
  entities: string[];
  /** Decision-specific fields (optional for other types). */
  reason?: string;
  alternatives?: string[];
  tradeoffs?: string;
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Entity {
  id: string;
  name: string;
  kind: string;
  aliases: string[];
}

export type RelationKind =
  | "depends_on"
  | "chose_over"
  | "caused_by"
  | "relates_to";

export interface Relation {
  from: string;
  to: string;
  kind: RelationKind;
  note?: string;
}

/** Inverted keyword index: token -> entry ids. */
export type KeywordIndex = Record<string, string[]>;
