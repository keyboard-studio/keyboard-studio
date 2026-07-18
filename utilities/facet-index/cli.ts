#!/usr/bin/env -S npx tsx
/**
 * facet-index CLI (spec 036 T020) — build the per-keyboard facet index.
 *
 * Usage:
 *   npx tsx utilities/facet-index/cli.ts [options]
 *
 * Options:
 *   --limit N          scan only the first N keyboards (sorted by id) — dev/smoke use.
 *   --check            build in memory and compare against the on-disk artifact;
 *                       writes nothing; exits non-zero if the artifact would change.
 *   --incremental      re-analyze only keyboards whose source hashes changed vs the
 *                       prior committed index (falls back to a full rescan on a
 *                       scannerVersion/unicodeVersion bump, or when no prior exists).
 *   --quiet            suppress the [OK] summary line (errors still print).
 *   --out <path>       override the write target (default docs/keyboard-facet-index.json).
 *   --corpus-root <p>  override the sibling `keymanapp/keyboards` checkout path.
 *
 * Default (no flags): full build, written to docs/keyboard-facet-index.json.
 */

import { existsSync, readFileSync } from "node:fs";

import { buildIndex, DEFAULT_OUT_PATH, type BuildOptions } from "./build-index.js";
import { stableStringify } from "./writeStable.js";
import type { FacetIndex } from "./types.js";

interface Args {
  limit: number | null;
  check: boolean;
  quiet: boolean;
  incremental: boolean;
  classifiedOnly: boolean;
  out?: string;
  corpusRoot?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { limit: null, check: false, quiet: false, incremental: false, classifiedOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") {
      const raw = argv[++i];
      const n = Number(raw);
      if (raw === undefined || Number.isNaN(n)) {
        console.error("[ERROR] --limit requires a numeric argument");
        process.exit(1);
      }
      args.limit = n;
    } else if (a === "--check") {
      args.check = true;
    } else if (a === "--incremental") {
      args.incremental = true;
    } else if (a === "--classified-only") {
      args.classifiedOnly = true;
    } else if (a === "--quiet") {
      args.quiet = true;
    } else if (a === "--out") {
      args.out = argv[++i];
    } else if (a === "--corpus-root") {
      args.corpusRoot = argv[++i];
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      "npx tsx utilities/facet-index/cli.ts [options]",
      "",
      "  --limit N          scan only the first N keyboards (dev/smoke use)",
      "  --check            compare against the on-disk artifact; write nothing; exit 1 if it would change",
      "  --incremental      re-analyze only keyboards whose source hashes changed vs the prior index",
      "  --classified-only  build only facets that have a registered classifier, skipping",
      "                     definition-only YAMLs a later spec landed ahead of its classifier",
      "                     (default build fails loud on such a def — the intentional guard)",
      "  --quiet            suppress the [OK] summary line",
      "  --out <path>       override the write target (default docs/keyboard-facet-index.json)",
      "  --corpus-root <p>  override the sibling keymanapp/keyboards checkout path",
    ].join("\n"),
  );
}

function summaryLine(index: FacetIndex): string {
  const keyboardCount = index.manifest.keyboardCount;
  const facetCount = index.manifest.facetIds.length;
  // Guaranteed 100% by construction (SC-001/X3 — buildIndex throws rather than
  // ship a keyboard missing a facet record), so this is a confirmation, not a
  // measurement of partial coverage.
  return `[OK] ${keyboardCount} keyboards, ${facetCount} facets, 100% coverage`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const buildOpts: BuildOptions = {
    limit: args.limit,
    incremental: args.incremental,
    onlyClassifiedFacets: args.classifiedOnly,
  };
  if (args.corpusRoot !== undefined) buildOpts.corpusRoot = args.corpusRoot;

  try {
    if (args.check) {
      const outPath = args.out ?? DEFAULT_OUT_PATH;
      const before = existsSync(outPath) ? readFileSync(outPath, "utf8") : null;
      const index = buildIndex({ ...buildOpts, outPath: "" });
      const after = stableStringify(index);
      if (before !== after) {
        console.error(`[ERROR] ${outPath} would change (run without --check to rebuild)`);
        process.exit(1);
      }
      if (!args.quiet) console.log(summaryLine(index));
      return;
    }

    if (args.out !== undefined) buildOpts.outPath = args.out;
    const index = buildIndex(buildOpts);
    if (!args.quiet) console.log(summaryLine(index));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${message}`);
    process.exit(1);
  }
}

main();
