// CLI for the NFC/NFD context-tolerance corpus harness.
//
// Run it through ./run.mjs (see README) — the engine's simulator reaches
// vendored KeymanWeb sources through aliases only a Vite resolver applies.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeKeyboard, DEFAULT_MAX_PROBES } from "./analyze.js";
import {
  discoverKeyboards,
  readKeyboard,
  DEFAULT_CORPUS_ROOT,
  resolveCorpusCommit,
  type KeyboardSource,
} from "./corpus.js";
import { HARMFUL_OUTCOMES, type Bucket, type CorpusReport, type KeyboardResult } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFAULT_OUT = resolve(HERE, "reports", "nfd-tolerance-corpus.json");

/**
 * Zeroed bucket tally in report order — worst first, so the interesting rows
 * are at the top of the summary. Written as a `Record<Bucket, number>` literal
 * rather than an array of names because that makes TypeScript enforce
 * completeness: a new bucket that is not listed here fails the build instead
 * of incrementing `undefined` into a NaN at run time.
 */
function emptyBucketCounts(): Record<Bucket, number> {
  return {
    regressed: 0,
    "gap-remaining": 0,
    "gap-fixed": 0,
    refused: 0,
    "compile-failed": 0,
    "harness-error": 0,
    "no-gap": 0,
  };
}

interface Options {
  corpusRoot: string;
  out: string;
  limit?: number;
  only: Set<string>;
  maxProbes: number;
  verbose: boolean;
  quiet: boolean;
}

const USAGE = [
  "Usage: node utilities/nfd-tolerance-corpus/run.mjs [options]",
  "",
  "  --corpus-root <path>  sibling keymanapp/keyboards checkout (default: ../keyboards)",
  "  --keyboard <id>       analyse only this keyboard; repeatable, or comma-separated",
  "  --limit <n>           analyse only the first n keyboards (by id)",
  `  --max-probes <n>      per-keyboard probe cap (default: ${DEFAULT_MAX_PROBES})`,
  "  --out <path>          JSON report path (default: reports/nfd-tolerance-corpus.json)",
  "  --verbose             keep the compiler's own console output",
  "  --quiet               JSON report only, no human summary",
  "  --help                this text",
].join("\n");

function parseArgs(argv: readonly string[]): Options | "help" {
  const options: Options = {
    corpusRoot: DEFAULT_CORPUS_ROOT,
    out: DEFAULT_OUT,
    only: new Set<string>(),
    maxProbes: DEFAULT_MAX_PROBES,
    verbose: false,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = (): string => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    // A typo'd count must not sail through as NaN: `--max-probes abc` would
    // make `probes.length >= cap` false forever and silently uncap the run.
    const count = (): number => {
      const parsed = Number.parseInt(value(), 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${arg} needs a positive integer`);
      }
      return parsed;
    };
    switch (arg) {
      case "--help":
      case "-h":
        return "help";
      case "--corpus-root":
        options.corpusRoot = resolve(value());
        break;
      case "--keyboard":
        for (const id of value().split(",")) if (id.length > 0) options.only.add(id);
        break;
      case "--limit":
        options.limit = count();
        break;
      case "--max-probes":
        options.maxProbes = count();
        break;
      case "--out": {
        const out = value();
        options.out = isAbsolute(out) ? out : resolve(process.cwd(), out);
        break;
      }
      case "--verbose":
        options.verbose = true;
        break;
      case "--quiet":
        options.quiet = true;
        break;
      default:
        throw new Error(`unknown option "${arg}"`);
    }
  }
  return options;
}

/**
 * Silence the compiler's per-keyboard `devLog` chatter for the duration of a
 * run. kmc-kmn narrates every compile through `console.log`, and a corpus run
 * makes four compiles per keyboard — thousands of lines that would bury the
 * summary. `console.error` is deliberately left alone.
 */
function withQuietConsole<T>(enabled: boolean, body: () => Promise<T>): Promise<T> {
  if (!enabled) return body();
  const saved = { log: console.log, info: console.info, debug: console.debug };
  const noop = (): void => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  return body().finally(() => {
    console.log = saved.log;
    console.info = saved.info;
    console.debug = saved.debug;
  });
}

function selectKeyboards(all: KeyboardSource[], options: Options): KeyboardSource[] {
  const filtered = options.only.size > 0 ? all.filter((k) => options.only.has(k.id)) : all;
  return options.limit !== undefined ? filtered.slice(0, options.limit) : filtered;
}

function tallyBuckets(results: readonly KeyboardResult[]): Record<Bucket, number> {
  const buckets = emptyBucketCounts();
  for (const result of results) buckets[result.bucket] += 1;
  return buckets;
}

function tallyRefusals(results: readonly KeyboardResult[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const result of results) {
    for (const [gate, count] of Object.entries(result.refusals)) {
      totals[gate] = (totals[gate] ?? 0) + count;
    }
  }
  return Object.fromEntries(Object.entries(totals).sort((a, b) => b[1] - a[1]));
}

function humanSummary(report: CorpusReport): string {
  const lines: string[] = [
    "NFC/NFD context-tolerance corpus harness",
    `corpus    ${report.corpusRoot} @ ${report.corpusCommit}`,
    `keyboards ${report.keyboards.length} analysed, up to ${report.maxProbesPerKeyboard} probes each`,
    "",
    `${"bucket".padEnd(16)}keyboards`,
    `${"-".repeat(14).padEnd(16)}---------`,
  ];
  for (const [bucket, count] of Object.entries(report.buckets)) {
    lines.push(`${bucket.padEnd(16)}${String(count).padStart(9)}`);
  }

  const refusals = Object.entries(report.refusals);
  if (refusals.length > 0) {
    lines.push("", "rules refused by an internal gate (whole run)");
    for (const [gate, count] of refusals) {
      lines.push(`  ${gate.padEnd(30)}${String(count).padStart(8)}`);
    }
  }

  const harmed = report.keyboards.filter((k) => k.bucket === "regressed");
  if (harmed.length > 0) {
    lines.push("", `[WARN] ${harmed.length} keyboard(s) made worse by the transform`);
    for (const keyboard of harmed) {
      const detail = HARMFUL_OUTCOMES.filter((o) => keyboard.probeCounts[o] > 0)
        .map((o) => `${keyboard.probeCounts[o]} ${o}`)
        .join(", ");
      lines.push(`  ${keyboard.id.padEnd(32)}${detail}`);
    }
  }

  const errored = report.keyboards.filter((k) => k.bucket === "harness-error");
  if (errored.length > 0) {
    lines.push("", `[WARN] ${errored.length} keyboard(s) the harness could not measure`);
    for (const keyboard of errored) {
      lines.push(`  ${keyboard.id.padEnd(32)}${keyboard.detail ?? ""}`);
    }
  }

  return lines.join("\n");
}

export async function main(argv: readonly string[]): Promise<number> {
  let options: Options | "help";
  try {
    options = parseArgs(argv);
  } catch (err) {
    console.error(`[ERROR] ${err instanceof Error ? err.message : String(err)}`);
    console.error(USAGE);
    return 2;
  }
  if (options === "help") {
    console.log(USAGE);
    return 0;
  }

  const discovered = discoverKeyboards(options.corpusRoot);
  if (discovered.length === 0) {
    console.error(
      `[ERROR] no keyboards found under ${options.corpusRoot}/release. ` +
        "Point --corpus-root at a keymanapp/keyboards checkout.",
    );
    return 1;
  }

  const selected = selectKeyboards(discovered, options);
  if (selected.length === 0) {
    console.error("[ERROR] no keyboards matched the given filters.");
    return 1;
  }

  const results = await withQuietConsole(!options.verbose, async () => {
    const out: KeyboardResult[] = [];
    for (const keyboard of selected) {
      out.push(await analyzeKeyboard(readKeyboard(options.corpusRoot, keyboard), options.maxProbes));
    }
    return out;
  });

  const report: CorpusReport = {
    schema: "nfd-tolerance-corpus/1",
    generatedAt: new Date().toISOString(),
    corpusRoot: options.corpusRoot,
    corpusCommit: resolveCorpusCommit(options.corpusRoot),
    maxProbesPerKeyboard: options.maxProbes,
    buckets: tallyBuckets(results),
    refusals: tallyRefusals(results),
    keyboards: results,
  };

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (!options.quiet) {
    console.log(humanSummary(report));
    console.log(`\nreport written to ${options.out}`);
  }
  return 0;
}
