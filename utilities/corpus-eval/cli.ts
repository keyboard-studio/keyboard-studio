/**
 * corpus-eval CLI — run the §7.5.1 corpus evaluation over a
 * keymanapp/keyboards `release/` tree and emit the StrategyDivergence
 * report (JSON + Markdown). Issue #297.
 *
 * Usage:
 *   tsx cli.ts --corpus-root <dir> [--vendor <name>] [--limit <n>]
 *              [--only <id,id,...>] [--out <dir>] [--quiet]
 *
 * The corpus root is a parameter (the directory containing `release/`);
 * the default is the sibling `keyboards` checkout next to this repo — the
 * same convention the supportability scanner uses. Nothing else about the
 * corpus location is assumed.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverKeyboards, evaluateDiscovered } from "./evaluate.js";
import { buildReport, renderMarkdown } from "./report.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

interface Args {
  corpusRoot: string;
  vendor?: string;
  limit: number | null;
  only: string[] | null;
  outDir: string | null;
  quiet: boolean;
}

function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined) {
    console.error(`[ERROR] ${flag} requires a value`);
    process.exit(2);
  }
  return v;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    corpusRoot: resolve(REPO_ROOT, "..", "keyboards"),
    limit: null,
    only: null,
    outDir: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--corpus-root":
        out.corpusRoot = resolve(requireValue(argv, ++i, a));
        break;
      case "--vendor":
        out.vendor = requireValue(argv, ++i, a);
        break;
      case "--limit": {
        const n = Number(requireValue(argv, ++i, a));
        if (!Number.isInteger(n) || n <= 0) {
          console.error(`[ERROR] ${a} requires a positive integer`);
          process.exit(2);
        }
        out.limit = n;
        break;
      }
      case "--only":
        out.only = requireValue(argv, ++i, a).split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--out":
        out.outDir = resolve(requireValue(argv, ++i, a));
        break;
      case "--quiet":
        out.quiet = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`[ERROR] unknown argument: ${a}`);
        printHelp();
        process.exit(2);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(
    [
      "corpus-eval — §7.5.1 corpus evaluation / StrategyDivergence report",
      "",
      "Usage: tsx cli.ts [options]",
      "",
      "  --corpus-root <dir>  directory containing release/ (default: sibling ../keyboards)",
      "  --vendor <name>      only this release/<vendor>/ subtree",
      "  --limit <n>          evaluate only the first n discovered keyboards",
      "  --only <id,id,...>   evaluate only these keyboard ids",
      "  --out <dir>          write corpus-eval.json + corpus-eval.md here",
      "  --quiet              suppress per-keyboard progress",
      "  -h, --help           show this help",
    ].join("\n"),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(join(args.corpusRoot, "release"))) {
    console.error(`[ERROR] no release/ tree under corpus root: ${args.corpusRoot}`);
    process.exit(2);
  }

  let keyboards = discoverKeyboards(args.corpusRoot, args.vendor);
  if (args.only !== null) {
    const wanted = new Set(args.only);
    keyboards = keyboards.filter((k) => wanted.has(k.id));
  }
  if (args.limit !== null) keyboards = keyboards.slice(0, args.limit);

  const scope =
    args.vendor !== undefined ? `release/${args.vendor}/**` : "release/**";
  if (!args.quiet) {
    console.log(`corpus-eval: ${keyboards.length} keyboards in scope ${scope}`);
  }

  const started = Date.now();
  const outcomes = keyboards.map((kb, i) => {
    if (!args.quiet && (i + 1) % 50 === 0) {
      console.log(`  …${i + 1}/${keyboards.length}`);
    }
    return evaluateDiscovered(kb);
  });
  const durationMs = Date.now() - started;

  const report = buildReport({
    corpusRoot: args.corpusRoot,
    corpusScope: scope,
    generatedAt: new Date().toISOString(),
    durationMs,
    discovered: keyboards.length,
    outcomes,
  });

  const s = report.summary;
  console.log(
    `corpus-eval: discovered=${s.discovered} parseFailures=${s.parseFailures} ` +
      `evaluated=${s.evaluated} agreements=${s.agreements} divergences=${s.divergences} ` +
      `unevaluable=${s.unevaluable} clusters=${report.clusters.length} in ${durationMs} ms`,
  );
  for (const c of report.clusters.slice(0, 10)) {
    console.log(
      `  cluster ×${c.count}: tree ${c.treePrimary} (rule ${String(c.triggeredRule)}) vs recognized ${c.recognizedPrimary} — ${c.keyboardIds.slice(0, 6).join(", ")}${c.count > 6 ? ", …" : ""}`,
    );
  }

  if (args.outDir !== null) {
    mkdirSync(args.outDir, { recursive: true });
    writeFileSync(join(args.outDir, "corpus-eval.json"), JSON.stringify(report, null, 2) + "\n");
    writeFileSync(join(args.outDir, "corpus-eval.md"), renderMarkdown(report));
    console.log(`corpus-eval: wrote ${join(args.outDir, "corpus-eval.json")} + corpus-eval.md`);
  }
}

main();
