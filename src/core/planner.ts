import { Paths, memoryFiles } from "./paths";
import { NewTaskInput } from "../types";
import { readMemory, extractListItems } from "./memory";
import { truncate } from "../utils/format";

/**
 * The planner turns project state into a scored task list — with zero LLM
 * dependency. The "intelligence" is heuristic: it parses the markdown memory
 * (open bugs, risks, placeholder docs, missing tests) into concrete next steps.
 *
 * This is exactly the seam a model adapter slots into later: swap the heuristics
 * for a model call and everything downstream (scoring, next, handoff) is unchanged.
 */

export async function generateTasks(p: Paths): Promise<NewTaskInput[]> {
  const memory = await readMemory(p);
  const tasks: NewTaskInput[] = [];

  // 1. Open bugs become high-priority tasks.
  for (const bug of extractListItems(memory.bugs ?? "")) {
    tasks.push({
      title: `Fix: ${truncate(bug, 80)}`,
      detail: bug,
      source: "bug",
    });
  }

  // 2. Explicit next actions are unfinished work.
  for (const action of extractListItems(memory.nextActions ?? "")) {
    tasks.push({
      title: truncate(action, 80),
      detail: action,
      source: "unfinished",
    });
  }

  // 3. Risks and assumptions become de-risking tasks.
  for (const risk of extractListItems(memory.risks ?? "")) {
    tasks.push({
      title: `De-risk: ${truncate(risk, 80)}`,
      detail: risk,
      source: "risk",
    });
  }

  // 4. Thin/placeholder memory files suggest documentation tasks.
  for (const { name, file } of memoryFiles(p)) {
    const content = (memory[name] ?? "").trim();
    if (isThin(content)) {
      tasks.push({
        title: `Document ${name.replace(/_/g, " ")}`,
        detail: `${file} is empty or still a placeholder — capture the real content.`,
        source: "docs",
      });
    }
  }

  // 5. If architecture mentions code but there's no test signal, suggest tests.
  const arch = (memory.architecture ?? "").toLowerCase();
  const state = (memory.current_state ?? "").toLowerCase();
  if ((arch.includes("api") || arch.includes("module") || state.includes("implement")) &&
      !state.includes("test")) {
    tasks.push({
      title: "Add tests for the core modules",
      detail: "Architecture describes real components but current state shows no test coverage.",
      source: "tests",
    });
  }

  return tasks;
}

/** A file is "thin" if it has no real list items and very little prose. */
function isThin(content: string): boolean {
  if (content.length < 40) return true;
  const items = extractListItems(content);
  const prose = content.replace(/^#.*$/gm, "").replace(/^_.*_$/gm, "").trim();
  return items.length === 0 && prose.length < 60;
}
