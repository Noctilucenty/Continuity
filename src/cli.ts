#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { logger } from "./utils/logger";
import { UserError } from "./commands/_shared";

import { init } from "./commands/init";
import { status } from "./commands/status";
import { plan } from "./commands/plan";
import { next } from "./commands/next";
import { checkpoint } from "./commands/checkpoint";
import { summarize } from "./commands/summarize";
import { review } from "./commands/review";
import { handoff } from "./commands/handoff";
import { resume } from "./commands/resume";
import { recall } from "./commands/recall";
import { decide } from "./commands/decide";
import { graph } from "./commands/graph";
import { pack } from "./commands/pack";
import { analyze } from "./commands/analyze";
import { decisions } from "./commands/decisions";
import { ask } from "./commands/ask";
import { done } from "./commands/done";
import { metrics } from "./commands/metrics";
import { entityAdd, entityList } from "./commands/entity";
import { link } from "./commands/link";
import { home } from "./commands/home";
import { mcp } from "./commands/mcp";
import { agentInstall, agentStatus, agentUninstall } from "./commands/agent";

/** Collect repeatable options (e.g. --changed a --changed b) into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("continuity")
  .description("An AI project runtime. Never lose AI project context again.")
  .version("0.8.0");

// Grouped, scannable help: hide the flat auto-list and print our own groups so
// the everyday commands are visibly prioritized.
const GROUPED_HELP = [
  "Commands:",
  "",
  "  Everyday:",
  "    init          Scaffold a Continuity project here",
  "    status        Show the project dashboard",
  "    plan          Generate tasks from your goal and memory",
  "    next          Start the highest-leverage task",
  "    done          Mark a task complete",
  "    checkpoint    Save state (use --from-git to auto-summarize)",
  "",
  "  AI handoff:",
  "    handoff       Write a model-specific briefing (--to, --copy)",
  "    resume        Print the prompt to restart work (--copy)",
  "    pack          Focused context bundle for a topic (--copy)",
  "",
  "  Knowledge:",
  "    ask           Answer a question from stored memory",
  "    recall        Search memory and decisions",
  "    decide        Record a decision",
  "    decisions     Browse the decision journal",
  "    entity        Manage knowledge-graph entities",
  "    link          Auto-link decisions/memory to entities",
  "    graph         Show the knowledge graph",
  "",
  "  Repository:",
  "    analyze       Inspect the repo for project intelligence",
  "",
  "  Insights:",
  "    metrics       Usage signal and task-completion velocity",
  "    review        Audit risk, tests, docs, and the next move",
  "    summarize     Compact digest of the whole project",
  "",
  "  Automatic (agents):",
  "    agent         Wire Claude Code/Codex/Cursor to auto resume + checkpoint",
  "    mcp           Run the MCP server over stdio (launched by agents)",
  "",
  "Run `continuity` with no arguments for your dashboard and next action.",
  "Run `continuity help <command>` for details on one command.",
].join("\n");

program.configureHelp({ visibleCommands: () => [] });
program.addHelpText("after", "\n" + GROUPED_HELP);

program
  .command("init")
  .description("Scaffold a Continuity project in the current directory")
  .option("--name <name>", "Project name")
  .option("--force", "Re-scaffold even if a project already exists")
  .action(init);

program
  .command("home")
  .description("Show the dashboard and your next best action (same as bare `continuity`)")
  .action(home);

program
  .command("status")
  .description("Show the project dashboard")
  .action(status);

program
  .command("plan [goal]")
  .description("Generate a scored task list from your goal and memory")
  .action((goal) => plan(goal));

program
  .command("next")
  .description("Start the single highest-leverage task")
  .option("--peek", "Show the next task without starting it")
  .action(next);

program
  .command("done [taskId]")
  .description("Mark a task complete (defaults to the current next task)")
  .action((taskId) => done(taskId));

program
  .command("checkpoint")
  .description("Save what changed; capture knowledge; refresh handoffs")
  .option("--summary <text>", "One-line summary")
  .option("--changed <text>", "Something that changed (repeatable)", collect, [])
  .option("--files <path>", "A file modified (repeatable)", collect, [])
  .option("--worked <text>", "Something that worked (repeatable)", collect, [])
  .option("--failed <text>", "Something that failed (repeatable)", collect, [])
  .option("--blocker <text>", "Current blocker")
  .option("--next <text>", "Next best action")
  .option("--decision <text>", "A decision to record (repeatable)", collect, [])
  .option("--lesson <text>", "A lesson learned (repeatable)", collect, [])
  .option("--bug <text>", "A bug discovered (repeatable)", collect, [])
  .option("--from-git", "Derive the checkpoint from the git working tree")
  .option("--since <ref>", "Derive the checkpoint from the git diff since <ref>")
  .action(checkpoint);

program
  .command("summarize")
  .description("Print a compact digest of the whole project")
  .action(summarize);

program
  .command("review")
  .description("Audit risk, tests, docs, and the next best move")
  .option("--apply", "Fold generated tasks into the queue")
  .action(review);

program
  .command("handoff")
  .description("Write a paste-ready briefing for another agent")
  .option("--to <agent>", "claude | gpt | cursor | gemini | generic", "generic")
  .option("--print", "Print the handoff instead of just saving it")
  .option("--copy", "Copy the handoff to the clipboard")
  .action((opts) => handoff(opts.to, opts));

program
  .command("resume")
  .description("Print the best prompt to restart work right now")
  .option("--raw", "Print only the prompt (pipe-friendly)")
  .option("--copy", "Copy the resume prompt to the clipboard")
  .action(resume);

program
  .command("recall [query]")
  .description("Search project memory and decisions")
  .option("--limit <n>", "Max results", "8")
  .option("--rebuild", "Rebuild the index from markdown memory first")
  .action((query, opts) => recall(query, opts));

program
  .command("decide [title]")
  .description("Record a decision in the journal")
  .option("--title <text>", "What was decided (or pass as the first argument)")
  .option("--reason <text>", "Why")
  .option("--context <text>", "Context around the decision")
  .option("--alternative <text>", "An alternative considered (repeatable)", collect, [])
  .option("--tradeoffs <text>", "Tradeoffs accepted")
  .option("--tag <tag>", "A tag (repeatable)", collect, [])
  .option("--file <path>", "A related file (repeatable)", collect, [])
  .option("--over <alternative>", "Record 'this over <alternative>' in the graph")
  .option("--supersedes <id>", "Mark a prior decision (by id) as superseded by this one")
  .action((title, opts) => decide(title, opts));

program
  .command("decisions")
  .description("Browse the decision journal")
  .option("--tag <tag>", "Only decisions with this tag")
  .option("--active", "Hide superseded/inactive decisions")
  .option("--search <query>", "Rank decisions by relevance to a query")
  .action(decisions);

program
  .command("ask [question]")
  .description("Answer a question from stored project memory (local, deterministic)")
  .option("--copy", "Copy the answer to the clipboard")
  .action((question, opts) => ask(question, opts));

program
  .command("metrics")
  .description("Show usage signal and task-completion velocity")
  .option("--json", "Emit the raw metrics as JSON")
  .action(metrics);

program
  .command("mcp")
  .description("Run the MCP server over stdio (for AI agents to call Continuity tools)")
  .action(mcp);

const agentCmd = program
  .command("agent")
  .description("Wire AI agents (Claude Code, Codex, Cursor) to Continuity");
agentCmd
  .command("install")
  .description("Install MCP config + lifecycle instructions for an agent")
  .option("--runner <runner>", "claude | codex | cursor | all", "all")
  .action(agentInstall);
agentCmd
  .command("status")
  .description("Show which agent hooks are installed")
  .option("--runner <runner>", "claude | codex | cursor | all", "all")
  .action(agentStatus);
agentCmd
  .command("uninstall")
  .description("Remove Continuity agent hooks")
  .option("--runner <runner>", "claude | codex | cursor | all", "all")
  .action(agentUninstall);

program
  .command("graph")
  .description("Show the knowledge graph")
  .option("--json", "Emit the raw graph as JSON")
  .action(graph);

const entityCmd = program
  .command("entity")
  .description("Manage knowledge-graph entities");
entityCmd
  .command("add <name>")
  .description("Register an entity the graph should track")
  .option("--kind <kind>", "Entity kind", "concept")
  .option("--alias <alias>", "An alias (repeatable)", collect, [])
  .action((name, opts) => entityAdd(name, opts));
entityCmd
  .command("list")
  .description("List registered entities and their link counts")
  .action(entityList);

program
  .command("link")
  .description("Auto-link decisions/memory to known entities (relates_to edges)")
  .option("--apply", "Write the proposed connections (default is preview)")
  .action(link);

program
  .command("pack [topic]")
  .description("Generate a focused context bundle for one area of the project")
  .option("--save", "Also save the pack to .continuity/packs/<topic>.md")
  .option("--copy", "Copy the context pack to the clipboard")
  .action((topic, opts) => pack(topic, opts));

program
  .command("analyze")
  .description("Inspect the repository and report local project intelligence")
  .option("--json", "Emit the raw analysis as JSON")
  .action(analyze);

async function main() {
  // Bare `continuity` (no args/flags) shows the friendly home screen and exits
  // successfully — never the command wall, never an error.
  if (process.argv.slice(2).length === 0) {
    await home();
    return;
  }

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof UserError) {
      logger.error(err.message);
    } else {
      logger.error("Something went wrong.");
      logger.dim(pc.dim(err instanceof Error ? err.message : String(err)));
    }
    process.exitCode = 1;
  }
}

main();
