import { Paths, paths } from "../core/paths";
import { isInitialized, loadConfig, readMemory } from "../core/memory";
import {
  loadCompleted,
  loadQueue,
  nextActionable,
  sortedByPriority,
} from "../core/tasks";
import { listCheckpoints } from "../core/checkpoints";
import { TaskStatus } from "../types";
import { relativeTime, truncate } from "../utils/format";

export type DashboardActionId =
  | "next"
  | "checkpoint"
  | "handoff"
  | "resume"
  | "ask"
  | "pack"
  | "init";

export interface DashboardAction {
  id: DashboardActionId;
  label: string;
  key: string;
  command: string[];
  prompt?: string;
}

export interface DashboardTask {
  title: string;
  status: TaskStatus;
}

export interface DashboardCheckpoint {
  id: string;
  age: string;
  summary: string;
}

export interface DashboardModel {
  initialized: boolean;
  projectName: string;
  currentState: string;
  tasks: DashboardTask[];
  nextAction: string;
  recentCheckpoints: DashboardCheckpoint[];
  actions: DashboardAction[];
}

export const PROJECT_ACTIONS: DashboardAction[] = [
  { id: "next", label: "Next", key: "n", command: ["next"] },
  { id: "checkpoint", label: "Checkpoint", key: "c", command: ["checkpoint", "--from-git"] },
  { id: "handoff", label: "Handoff", key: "h", command: ["handoff", "--to", "claude"] },
  { id: "resume", label: "Resume", key: "r", command: ["resume"] },
  { id: "ask", label: "Ask", key: "a", command: ["ask"], prompt: "Question" },
  { id: "pack", label: "Pack", key: "p", command: ["pack"], prompt: "Topic" },
];

const INIT_ACTIONS: DashboardAction[] = [
  { id: "init", label: "Init", key: "i", command: ["init"] },
];

export async function gatherDashboard(p: Paths = paths()): Promise<DashboardModel> {
  if (!(await isInitialized(p))) {
    return {
      initialized: false,
      projectName: "Uninitialized project",
      currentState: "Run init to create local Continuity files.",
      tasks: [
        { title: "Initialize Continuity", status: "todo" },
        { title: "Plan the first goal", status: "todo" },
      ],
      nextAction: "continuity init",
      recentCheckpoints: [],
      actions: INIT_ACTIONS,
    };
  }

  const [config, memory, queue, completed, checkpoints] = await Promise.all([
    loadConfig(p),
    readMemory(p),
    loadQueue(p),
    loadCompleted(p),
    listCheckpoints(p),
  ]);

  const open = queue.filter((t) => t.status !== "done");
  const topOpen = sortedByPriority(open).slice(0, 5);
  const done = completed.slice(-3).reverse();
  const taskRows: DashboardTask[] = [
    ...done.map((t) => ({ title: t.title, status: "done" as const })),
    ...topOpen.map((t) => ({ title: t.title, status: t.status })),
  ].slice(0, 6);
  const next = nextActionable(queue);

  return {
    initialized: true,
    projectName: config?.name ?? "Project",
    currentState: firstLine(memory.current_state) || config?.goal || "No current state recorded yet.",
    tasks: taskRows,
    nextAction: next?.title ?? "Plan a goal or add a task",
    recentCheckpoints: checkpoints
      .slice(-5)
      .reverse()
      .map((cp) => ({
        id: cp.id,
        age: relativeTime(cp.createdAt),
        summary: cp.summary,
      })),
    actions: PROJECT_ACTIONS,
  };
}

export function renderDashboardPlain(m: DashboardModel): string {
  const lines = [
    "Continuity",
    "",
    `Project: ${m.projectName}`,
    `Current state: ${truncate(m.currentState, 72)}`,
    "",
    "Tasks",
  ];

  for (const task of m.tasks.slice(0, 6)) {
    const mark = task.status === "done" ? "[x]" : task.status === "in_progress" ? "[~]" : "[ ]";
    lines.push(`${mark} ${truncate(task.title, 72)}`);
  }
  if (m.tasks.length === 0) lines.push("[ ] No tasks yet");

  lines.push("", "Next action:", truncate(m.nextAction, 72), "", "Recent checkpoints:");
  if (m.recentCheckpoints.length === 0) {
    lines.push("none yet");
  } else {
    for (const cp of m.recentCheckpoints.slice(0, 3)) {
      lines.push(`${cp.age}${cp.summary ? ` - ${truncate(cp.summary, 54)}` : ""}`);
    }
  }

  lines.push("", "Actions:", m.actions.map((a) => `[${a.label}]`).join(" "));
  return lines.join("\n");
}

export function renderDashboardScreen(
  m: DashboardModel,
  selectedAction: number,
  size: { columns: number; rows: number }
): string {
  const width = Math.max(48, size.columns);
  const bodyWidth = Math.max(32, Math.min(86, width - 4));
  const lines = renderDashboardPlain(m).split("\n");
  const rendered = lines.map((line) => renderLine(line, m.actions, selectedAction, bodyWidth));

  const footer = [
    "",
    "Tab/arrows choose action. Enter runs it. Hotkeys: " +
      m.actions.map((a) => a.key).join("/") +
      ". q quits.",
  ];

  return [
    "\x1b[2J\x1b[H",
    ...rendered,
    ...footer.map((line) => truncateToWidth(line, bodyWidth)),
  ]
    .slice(0, Math.max(1, size.rows - 1))
    .join("\n");
}

export function selectedActionIndex(
  actions: DashboardAction[],
  current: number,
  direction: 1 | -1
): number {
  if (actions.length === 0) return 0;
  return (current + direction + actions.length) % actions.length;
}

function renderLine(
  line: string,
  actions: DashboardAction[],
  selectedAction: number,
  width: number
): string {
  if (!line.startsWith("Actions:")) return truncateToWidth(line, width);
  const parts = actions.map((action, idx) => {
    const text = `[${action.label}]`;
    return idx === selectedAction ? `>${text}<` : ` ${text} `;
  });
  return truncateToWidth(`Actions: ${parts.join(" ")}`, width);
}

function truncateToWidth(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)).trimEnd() + "…";
}

function firstLine(md: string | undefined): string {
  if (!md) return "";
  const line = md
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("#") && !/^_.*_$/.test(l.trim()));
  return line ? line.trim() : "";
}
