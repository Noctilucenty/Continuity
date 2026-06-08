import pc from "picocolors";
import { analyzeRepo } from "../repo/analyzer";
import { logger } from "../utils/logger";
import { pluralize, truncate } from "../utils/format";

/**
 * `continuity analyze` — local repository intelligence. Runs on the current
 * directory and does not require an initialized Continuity project, so it works
 * as a standalone repo audit.
 */
export async function analyze(opts: { json?: boolean }): Promise<void> {
  const report = await analyzeRepo(process.cwd());

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  logger.heading("Repository analysis");
  logger.line(
    `  ${report.totalFiles} files scanned · ${report.sourceFiles} source · ${report.testFiles} test`
  );
  logger.line(`  CI: ${report.hasCI ? pc.green("detected") : pc.yellow("none")}`);
  if (report.packageScripts.length) {
    logger.line(`  Scripts: ${report.packageScripts.join(", ")}`);
  }

  if (report.filesWithoutTests.length) {
    logger.heading(`Source files without a paired test (${report.filesWithoutTests.length})`);
    for (const f of report.filesWithoutTests.slice(0, 12)) logger.line(`  - ${f}`);
    if (report.filesWithoutTests.length > 12) logger.dim(`  …and ${report.filesWithoutTests.length - 12} more`);
  }

  if (report.todos.length) {
    logger.heading(`${pluralize(report.todos.length, "TODO/FIXME/HACK marker")}`);
    for (const t of report.todos.slice(0, 12)) {
      logger.line(`  ${pc.dim(`${t.file}:${t.line}`)} ${t.marker} ${truncate(t.text, 60)}`);
    }
    if (report.todos.length > 12) logger.dim(`  …and ${report.todos.length - 12} more`);
  }

  if (report.largeFiles.length) {
    logger.heading(`Large files (${report.largeFiles.length})`);
    for (const f of report.largeFiles.slice(0, 10)) {
      logger.line(`  - ${f.file} (${Math.round(f.size / 1024)} KB)`);
    }
  }

  if (report.docsGaps.length) {
    logger.heading("Docs gaps");
    for (const g of report.docsGaps) logger.line(`  - ${g}`);
  }

  if (report.highRiskAreas.length) {
    logger.heading("High-risk areas");
    for (const a of report.highRiskAreas) logger.line(`  ${pc.yellow("!")} ${a}`);
  }

  logger.heading("Recommended next actions");
  for (const r of report.recommendations) logger.line(`  ${pc.green("→")} ${r}`);
  logger.line("");
}
