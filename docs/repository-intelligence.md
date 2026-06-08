# Repository intelligence

`continuity analyze` inspects the repository locally and produces actionable
project intelligence — not just statistics. It is deterministic, requires no
network, and does not need an initialized Continuity project.

## Usage

```bash
continuity analyze
continuity analyze --json    # machine-readable report
```

## What it reports

- Total files scanned, source file count, test file count
- Source files without a paired test
- TODO / FIXME / HACK / XXX comments (with file and line)
- Large files (over the configured threshold)
- Possible docs gaps (missing README, missing docs/)
- package.json scripts
- CI presence (GitHub Actions, GitLab CI, CircleCI, Azure Pipelines)
- High-risk areas (untested code, FIXME/HACK markers, large files)
- Recommended next actions

## Ignored directories

`node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.turbo`,
`vendor`, `.continuity`, `.cache`. Binary files (by extension) and very large
files are skipped when scanning for text markers.

## Configurable constants

In `src/repo/analyzer.ts`:

- `LARGE_FILE_BYTES` — the "large file" threshold (default 64 KB).
- `MAX_SCAN_BYTES` — files larger than this are not read for marker scanning
  (default 512 KB).
- `SOURCE_EXTENSIONS` — which extensions count as source.

## Test pairing

A source file `src/foo.ts` is considered tested if any test file shares its base
name (`foo`), e.g. `test/foo.test.ts`, `src/foo.spec.ts`, or a file under a
`__tests__/` directory. Entry points and config files (`cli.ts`, `index.ts`,
`main.ts`, `types.ts`, `*.config.*`) are exempt from the "needs a test" check.

## Architecture

- `src/repo/walk.ts` — shared ignore-aware recursive file walker.
- `src/repo/analyzer.ts` — `analyzeRepo(root)` plus pure, unit-tested helpers
  (`isSourceFile`, `isTestFile`, `findTodos`, `baseName`, `isLarge`).
- `src/commands/analyze.ts` — the CLI command.
