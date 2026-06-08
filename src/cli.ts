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

/** Collect repeatable options (e.g. --changed a --changed b) into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("continuity")
  .description("An AI project runtime. Never lose AI project context again.")
  .version("0.2.0");

program
  .command("init")
  .description("Scaffold a Continuity project in the current directory")
  .option("--name <name>", "Project name")
  .option("--force", "Re-scaffold even if a project already exists")
  .action(init);

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
  .action((opts) => handoff(opts.to, opts));

program
  .command("resume")
  .description("Print the best prompt to restart work right now")
  .option("--raw", "Print only the prompt (pipe-friendly)")
  .action(resume);

program
  .command("recall [query]")
  .description("Search project memory and decisions")
  .option("--limit <n>", "Max results", "8")
  .option("--rebuild", "Rebuild the index from markdown memory first")
  .action((query, opts) => recall(query, opts));

program
  .command("decide")
  .description("Record a decision in the journal")
  .option("--title <text>", "What was decided")
  .option("--reason <text>", "Why")
  .option("--alternative <text>", "An alternative considered (repeatable)", collect, [])
  .option("--tradeoffs <text>", "Tradeoffs accepted")
  .option("--tag <tag>", "A tag (repeatable)", collect, [])
  .option("--over <alternative>", "Record 'this over <alternative>' in the graph")
  .action(decide);

program
  .command("graph")
  .description("Show the knowledge graph")
  .option("--json", "Emit the raw graph as JSON")
  .action(graph);

async function main() {
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
