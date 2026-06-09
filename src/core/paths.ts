import path from "path";

/**
 * Single source of truth for where everything lives on disk.
 *
 * Every module imports paths from here so the layout is defined exactly once.
 * Change the structure here and the whole tool follows.
 */

export const ROOT_DIR = ".continuity";
export const ROOT_DOC = "CONTINUITY.md";

export function paths(cwd = process.cwd()) {
  const root = path.join(cwd, ROOT_DIR);
  const memory = path.join(root, "memory");
  const tasks = path.join(root, "tasks");
  const sessions = path.join(root, "sessions");
  const handoffs = path.join(root, "handoffs");
  const knowledge = path.join(root, "knowledge");

  return {
    cwd,
    root,
    rootDoc: path.join(cwd, ROOT_DOC),
    config: path.join(root, "config.json"),
    metrics: path.join(root, "metrics.json"),

    memory: {
      dir: memory,
      vision: path.join(memory, "vision.md"),
      architecture: path.join(memory, "architecture.md"),
      currentState: path.join(memory, "current_state.md"),
      decisions: path.join(memory, "decisions.md"),
      bugs: path.join(memory, "bugs.md"),
      nextActions: path.join(memory, "next_actions.md"),
      risks: path.join(memory, "risks.md"),
    },

    tasks: {
      dir: tasks,
      queue: path.join(tasks, "task_queue.json"),
      completed: path.join(tasks, "completed_tasks.json"),
    },

    sessions: {
      dir: sessions,
      log: path.join(sessions, "session_log.md"),
      checkpoints: path.join(sessions, "checkpoints"),
    },

    handoffs: {
      dir: handoffs,
      claude: path.join(handoffs, "claude.md"),
      gpt: path.join(handoffs, "gpt.md"),
      cursor: path.join(handoffs, "cursor.md"),
      gemini: path.join(handoffs, "gemini.md"),
      generic: path.join(handoffs, "generic.md"),
    },

    knowledge: {
      dir: knowledge,
      entries: path.join(knowledge, "entries.json"),
      entities: path.join(knowledge, "entities.json"),
      relations: path.join(knowledge, "relations.json"),
      index: path.join(knowledge, "index.json"),
    },
  };
}

export type Paths = ReturnType<typeof paths>;

/** The list of memory markdown files, for iteration. */
export function memoryFiles(p: Paths): { name: string; file: string }[] {
  return [
    { name: "vision", file: p.memory.vision },
    { name: "architecture", file: p.memory.architecture },
    { name: "current_state", file: p.memory.currentState },
    { name: "decisions", file: p.memory.decisions },
    { name: "bugs", file: p.memory.bugs },
    { name: "next_actions", file: p.memory.nextActions },
    { name: "risks", file: p.memory.risks },
  ];
}
