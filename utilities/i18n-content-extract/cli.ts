#!/usr/bin/env -S npx tsx
/**
 * i18n-content-extract CLI (spec 046 T027) — build the Tier B content-i18n
 * sidecar catalogs.
 *
 * Usage:
 *   npx tsx utilities/i18n-content-extract/cli.ts [options]
 *
 * Options:
 *   --check   build in memory and compare against the on-disk catalogs;
 *             writes nothing; exits non-zero if any catalog would change.
 *   --quiet   suppress the [OK] summary line (errors still print).
 *
 * Default (no flags): full build, written to content/i18n/en/*.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { extractContentCatalogs, type ContentCatalog, type ContentRoots } from "./extract.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

export interface RunOptions extends ContentRoots {
  outDir: string;
  check: boolean;
}

export interface RunResult {
  changed: string[];
  total: number;
  fileCount: number;
}

// Stable key order so re-running with no content changes produces a
// byte-identical file — required for --check to be a meaningful diff.
function stableStringify(catalog: ContentCatalog): string {
  const sorted: ContentCatalog = {};
  for (const key of Object.keys(catalog).sort()) sorted[key] = catalog[key];
  return JSON.stringify(sorted, null, 2) + "\n";
}

/**
 * Core extract-and-write-or-check logic, parameterized so it's testable
 * against a temp directory instead of the real repo content tree.
 */
export function run(options: RunOptions): RunResult {
  const catalogs = extractContentCatalogs({
    patternsDir: options.patternsDir,
    adaptationQuestionsDir: options.adaptationQuestionsDir,
  });

  const files: Array<[string, ContentCatalog]> = [
    ["patterns.json", catalogs.patterns],
    ["adaptationQuestions.json", catalogs.adaptationQuestions],
    ["criteria.json", catalogs.criteria],
  ];

  const changed: string[] = [];
  for (const [name, catalog] of files) {
    const outPath = join(options.outDir, name);
    const after = stableStringify(catalog);
    const before = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
    if (before === after) continue;
    changed.push(name);
    if (!options.check) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, after);
    }
  }

  const total = files.reduce((n, [, c]) => n + Object.keys(c).length, 0);
  return { changed, total, fileCount: files.length };
}

interface Args {
  check: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { check: false, quiet: false };
  for (const a of argv) {
    if (a === "--check") args.check = true;
    else if (a === "--quiet") args.quiet = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "npx tsx utilities/i18n-content-extract/cli.ts [options]",
      "",
      "  --check   compare against the on-disk catalogs; write nothing; exit 1 if any would change",
      "  --quiet   suppress the [OK] summary line",
    ].join("\n"),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const result = run({
    patternsDir: join(REPO_ROOT, "content", "patterns"),
    adaptationQuestionsDir: join(REPO_ROOT, "content", "adaptation-questions"),
    outDir: join(REPO_ROOT, "content", "i18n", "en"),
    check: args.check,
  });

  if (args.check && result.changed.length > 0) {
    console.error(
      `[ERROR] content/i18n/en/{${result.changed.join(", ")}} would change (run without --check to rebuild)`,
    );
    process.exit(1);
  }

  if (!args.quiet) {
    console.log(`[OK] ${result.total} content strings across ${result.fileCount} catalogs`);
  }
}

// Only run when invoked directly (`tsx cli.ts`), not when cli.test.ts imports
// `run` for testing. Compares filesystem paths directly (not `import.meta.url`
// vs `process.argv[1]`) since a naive `file://` string-build mismatches on
// Windows (drive-letter/slash differences).
if (import.meta.filename === process.argv[1]) {
  main();
}
