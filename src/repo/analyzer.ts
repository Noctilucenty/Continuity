import { promises as fs } from "fs";
import path from "path";
import { walkFiles, readTextCapped, WalkedFile } from "./walk";

/**
 * Repository Intelligence (v2B #3).
 *
 * A local, deterministic scan of the repository that produces *actionable*
 * project intelligence — not just counts. No network, no external tools. The
 * pure helpers (isSourceFile, isTestFile, findTodos, baseName) are exported so
 * they can be unit-tested directly.
 */

/** Files larger than this are flagged as "large" (worth splitting/reviewing). */
export const LARGE_FILE_BYTES = 64 * 1024; // 64 KB

/** Files larger than this are not read for TODO scanning (perf + binary guard). */
export const MAX_SCAN_BYTES = 512 * 1024; // 512 KB

export const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

const TODO_MARKERS = ["TODO", "FIXME", "HACK", "XXX"];

export interface TodoHit {
  file: string;
  line: number;
  marker: string;
  text: string;
}

export interface AnalysisReport {
  totalFiles: number;
  sourceFiles: number;
  testFiles: number;
  filesWithoutTests: string[];
  todos: TodoHit[];
  largeFiles: { file: string; size: number }[];
  docsGaps: string[];
  packageScripts: string[];
  hasCI: boolean;
  highRiskAreas: string[];
  recommendations: string[];
}

/* ---------- pure, testable helpers ---------- */

export function isSourceFile(file: WalkedFile): boolean {
  return SOURCE_EXTENSIONS.has(file.ext) && !isTestFile(file.rel) && !isDeclaration(file.rel);
}

export function isTestFile(rel: string): boolean {
  const norm = rel.replace(/\\/g, "/").toLowerCase();
  return (
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(norm) ||
    norm.includes("/__tests__/") ||
    norm.startsWith("__tests__/") ||
    norm.startsWith("test/") ||
    norm.startsWith("tests/") ||
    norm.includes("/test/") ||
    norm.includes("/tests/")
  );
}

function isDeclaration(rel: string): boolean {
  return /\.d\.ts$/.test(rel.toLowerCase());
}

/** The base name used to pair a source file with its test (foo.ts -> "foo"). */
export function baseName(rel: string): string {
  const file = path.basename(rel.replace(/\\/g, "/"));
  return file.replace(/\.(test|spec)\.[cm]?[jt]sx?$/, "").replace(/\.[cm]?[jt]sx?$/, "");
}

export function findTodos(text: string, file: string): TodoHit[] {
  const hits: TodoHit[] = [];
  const lines = text.split("\n");
  const re = new RegExp(`\\b(${TODO_MARKERS.join("|")})\\b[:\\s]?(.*)`);
  lines.forEach((line, i) => {
    const m = line.match(re);
    if (m) hits.push({ file, line: i + 1, marker: m[1], text: m[2].trim().slice(0, 100) });
  });
  return hits;
}

export function isLarge(size: number): boolean {
  return size > LARGE_FILE_BYTES;
}

/* ---------- the analysis ---------- */

export async function analyzeRepo(root: string): Promise<AnalysisReport> {
  const files = await walkFiles(root);

  const sourceFiles = files.filter(isSourceFile);
  const testFiles = files.filter((f) => isTestFile(f.rel) && SOURCE_EXTENSIONS.has(f.ext));

  // Pair source files with tests by base name.
  const testBases = new Set(testFiles.map((t) => baseName(t.rel)));
  const filesWithoutTests = sourceFiles
    .filter((f) => !testBases.has(baseName(f.rel)) && !isEntrypoint(f.rel))
    .map((f) => f.rel);

  // TODO/FIXME/HACK scan across readable text files.
  const todos: TodoHit[] = [];
  for (const f of files) {
    const text = await readTextCapped(f, MAX_SCAN_BYTES);
    if (text) todos.push(...findTodos(text, f.rel));
  }

  const largeFiles = files
    .filter((f) => isLarge(f.size))
    .map((f) => ({ file: f.rel, size: f.size }));

  const packageScripts = await readPackageScripts(root);
  const hasCI = await detectCI(root);
  const docsGaps = await findDocsGaps(root, files);

  const highRiskAreas = buildRiskAreas({ filesWithoutTests, todos, largeFiles });
  const recommendations = buildRecommendations({
    filesWithoutTests,
    todos,
    largeFiles,
    hasCI,
    docsGaps,
    sourceCount: sourceFiles.length,
    testCount: testFiles.length,
  });

  return {
    totalFiles: files.length,
    sourceFiles: sourceFiles.length,
    testFiles: testFiles.length,
    filesWithoutTests,
    todos,
    largeFiles,
    docsGaps,
    packageScripts,
    hasCI,
    highRiskAreas,
    recommendations,
  };
}

/* ---------- internals ---------- */

/** Entry points and config files rarely need their own unit test. */
function isEntrypoint(rel: string): boolean {
  const base = path.basename(rel.replace(/\\/g, "/"));
  return ["cli.ts", "index.ts", "main.ts", "types.ts"].includes(base) ||
    /\.config\.[cm]?[jt]s$/.test(base);
}

async function readPackageScripts(root: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path.join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return Object.keys(pkg.scripts ?? {});
  } catch {
    return [];
  }
}

async function detectCI(root: string): Promise<boolean> {
  const candidates = [
    path.join(root, ".github", "workflows"),
    path.join(root, ".gitlab-ci.yml"),
    path.join(root, ".circleci", "config.yml"),
    path.join(root, "azure-pipelines.yml"),
  ];
  for (const c of candidates) {
    try {
      const stat = await fs.stat(c);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(c);
        if (entries.some((e) => /\.ya?ml$/.test(e))) return true;
      } else if (stat.isFile()) {
        return true;
      }
    } catch {
      // not present — keep checking
    }
  }
  return false;
}

async function findDocsGaps(root: string, files: WalkedFile[]): Promise<string[]> {
  const gaps: string[] = [];
  const hasReadme = files.some((f) => /^readme(\.md|\.txt)?$/i.test(path.basename(f.rel)));
  if (!hasReadme) gaps.push("No README found at the repository root.");

  const hasDocsDir = await dirExists(path.join(root, "docs"));
  const hasSrc = files.some((f) => f.rel.replace(/\\/g, "/").startsWith("src/"));
  if (hasSrc && !hasDocsDir) gaps.push("Source code present but no docs/ directory.");

  return gaps;
}

async function dirExists(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

function buildRiskAreas(args: {
  filesWithoutTests: string[];
  todos: TodoHit[];
  largeFiles: { file: string; size: number }[];
}): string[] {
  const areas: string[] = [];
  if (args.filesWithoutTests.length) {
    areas.push(`${args.filesWithoutTests.length} source file(s) without a paired test.`);
  }
  const fixmes = args.todos.filter((t) => t.marker === "FIXME" || t.marker === "HACK");
  if (fixmes.length) {
    areas.push(`${fixmes.length} FIXME/HACK marker(s) indicating known-fragile code.`);
  }
  if (args.largeFiles.length) {
    areas.push(`${args.largeFiles.length} large file(s) that may be doing too much.`);
  }
  return areas;
}

function buildRecommendations(args: {
  filesWithoutTests: string[];
  todos: TodoHit[];
  largeFiles: { file: string; size: number }[];
  hasCI: boolean;
  docsGaps: string[];
  sourceCount: number;
  testCount: number;
}): string[] {
  const recs: string[] = [];
  if (args.filesWithoutTests.length) {
    const sample = args.filesWithoutTests.slice(0, 3).join(", ");
    recs.push(`Add tests for ${args.filesWithoutTests.length} untested source file(s) (e.g. ${sample}).`);
  }
  if (args.todos.length) {
    recs.push(`Resolve or ticket ${args.todos.length} TODO/FIXME/HACK comment(s).`);
  }
  if (args.largeFiles.length) {
    recs.push(`Review ${args.largeFiles.length} large file(s) for a possible split.`);
  }
  if (!args.hasCI) {
    recs.push("Add a CI workflow to run typecheck/build/test on every push.");
  }
  for (const gap of args.docsGaps) recs.push(gap);
  if (args.testCount === 0 && args.sourceCount > 0) {
    recs.push("No tests detected at all — establish a test suite for the core modules.");
  }
  if (!recs.length) recs.push("No structural issues detected. Keep tests and docs current.");
  return recs;
}
