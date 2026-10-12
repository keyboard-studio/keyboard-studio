// CLI for the NFC/NFD context-tolerance corpus harness.
//
// Run it through ./run.mjs (see README) — the engine's simulator reaches
// vendored KeymanWeb sources through aliases only a Vite resolver applies.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeKeyboard, DEFAULT_MAX_PROBES } from "./analyze.js";
import {
  discoverKeyboards,
  readKeyboard,
  DEFAULT_CORPUS_ROOT,
  resolveCorpusCommit,
  type KeyboardSource,
} from "./corpus.js";
import {
  GENERATOR_VERSION,
  hashKeyboardOnDisk,
  mergeRecords,
  parseRecord,
  serializeRecord,
  staleKeyboards,
  verifyKeyboard,
  DEFAULT_DEPS,
  DEFAULT_VERIFY_BUDGET_MS,
  type KeyboardRecord,
  type VerificationRecord,
} from "./normalization-step.js";
import { HARMFUL_OUTCOMES, type Bucket, type CorpusReport, type KeyboardResult } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFAULT_OUT = resolve(HERE, "reports", "nfd-tolerance-corpus.json");
const DEFAULT_RECORD = resolve(HERE, "..", "..", "docs", "context-normalization-verification.json");
/** Keyboards handed to a worker process at a time: amortises its start-up, still balances load. */
const WORKER_BATCH = 8;

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
  failOnRegressed: boolean;
  mode: "transform" | "normalization-step";
  jobs: number;
  incremental: boolean;
  check: boolean;
  record: string;
  /** Per-keyboard wall-clock cap for normalization-step verification, in milliseconds. */
  budgetMs: number;
  /** Internal: a worker reads its keyboard ids from here and writes records to `fragmentOut`. */
  idsFile?: string;
  fragmentOut?: string;
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
  "  --fail-on-regressed   exit 1 when any keyboard is bucketed regressed (CI gate)",
  "  --mode <mode>         transform (default, spec 062 harness) or normalization-step (spec 086)",
  "",
  "normalization-step mode:",
  "  --jobs <n>            verify n keyboards in parallel worker processes (default 1)",
  "  --incremental         re-simulate only keyboards whose source or generator version changed",
  "  --check               exit 1 when any record is stale or missing; no simulation",
  "  --record <path>       verification record (default: docs/context-normalization-verification.json)",
  `  --budget-minutes <n>  per-keyboard time cap before it is recorded harness-error (default ${DEFAULT_VERIFY_BUDGET_MS / 60_000})`,
  "",
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
    failOnRegressed: false,
    mode: "transform",
    jobs: 1,
    incremental: false,
    check: false,
    record: DEFAULT_RECORD,
    budgetMs: DEFAULT_VERIFY_BUDGET_MS,
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
      case "--fail-on-regressed":
        options.failOnRegressed = true;
        break;
      case "--mode": {
        const mode = value();
        if (mode !== "transform" && mode !== "normalization-step") {
          throw new Error('--mode must be "transform" or "normalization-step"');
        }
        options.mode = mode;
        break;
      }
      case "--jobs":
        options.jobs = count();
        break;
      case "--incremental":
        options.incremental = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--record": {
        const record = value();
        options.record = isAbsolute(record) ? record : resolve(process.cwd(), record);
        break;
      }
      case "--budget-minutes":
        options.budgetMs = count() * 60_000;
        break;
      case "--ids-file":
        options.idsFile = value();
        break;
      case "--fragment-out":
        options.fragmentOut = value();
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

/** Verify the given keyboards in this process, in id order. */
async function verifyInProcess(
  options: Options,
  keyboards: readonly KeyboardSource[],
  log: (line: string) => void,
): Promise<Record<string, KeyboardRecord>> {
  const out: Record<string, KeyboardRecord> = {};
  for (const keyboard of keyboards) {
    const started = Date.now();
    const sourceHash = hashKeyboardOnDisk(join(options.corpusRoot, keyboard.path));
    const record = await withQuietConsole(!options.verbose, () =>
      verifyKeyboard(readKeyboard(options.corpusRoot, keyboard), sourceHash, DEFAULT_DEPS, options.budgetMs),
    );
    out[keyboard.id] = record;
    log(`[INFO] ${keyboard.id.padEnd(32)}${record.outcome.padEnd(14)}${String(Date.now() - started).padStart(8)} ms`);
  }
  return out;
}

/** Fan keyboards out to worker processes that re-enter this CLI with `--ids-file`. */
async function verifyInWorkers(
  options: Options,
  keyboards: readonly KeyboardSource[],
  log: (line: string) => void,
  onBatch: (done: Record<string, KeyboardRecord>) => void,
): Promise<Record<string, KeyboardRecord>> {
  const scratch = mkdtempSync(join(tmpdir(), "nfd-normalization-"));
  const batches: KeyboardSource[][] = [];
  // Small enough that every job gets work even on a short list.
  const batchSize = Math.max(1, Math.min(WORKER_BATCH, Math.ceil(keyboards.length / options.jobs)));
  for (let i = 0; i < keyboards.length; i += batchSize) batches.push(keyboards.slice(i, i + batchSize));
  const out: Record<string, KeyboardRecord> = {};
  let next = 0;
  let done = 0;

  const runBatch = (index: number): Promise<void> =>
    new Promise((resolveBatch, reject) => {
      const idsFile = join(scratch, `ids-${index}.txt`);
      const fragmentOut = join(scratch, `fragment-${index}.json`);
      writeFileSync(idsFile, batches[index]!.map((k) => k.id).join("\n"), "utf8");
      const args = [
        resolve(HERE, "run.mjs"),
        "--mode", "normalization-step",
        "--corpus-root", options.corpusRoot,
        "--ids-file", idsFile,
        "--fragment-out", fragmentOut,
        "--budget-minutes", String(Math.round(options.budgetMs / 60_000)),
        "--quiet",
      ];
      const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "inherit"] });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0 || !existsSync(fragmentOut)) {
          reject(new Error(`worker for batch ${index} exited with ${code}`));
          return;
        }
        const fragment = JSON.parse(readFileSync(fragmentOut, "utf8")) as Record<string, KeyboardRecord>;
        Object.assign(out, fragment);
        onBatch(out);
        done += batches[index]!.length;
        log(`[INFO] ${done}/${keyboards.length} keyboards verified`);
        resolveBatch();
      });
    });

  const lane = async (): Promise<void> => {
    while (next < batches.length) await runBatch(next++);
  };
  try {
    await Promise.all(Array.from({ length: Math.min(options.jobs, batches.length) }, lane));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return out;
}

async function runNormalizationMode(options: Options): Promise<number> {
  const discovered = discoverKeyboards(options.corpusRoot);
  if (discovered.length === 0) {
    console.error(`[ERROR] no keyboards found under ${options.corpusRoot}/release.`);
    return 1;
  }

  // Worker: verify the listed keyboards and hand the records back.
  if (options.idsFile !== undefined) {
    const ids = new Set(readFileSync(options.idsFile, "utf8").split("\n").filter((l) => l.length > 0));
    const mine = discovered.filter((k) => ids.has(k.id));
    const records = await verifyInProcess(options, mine, () => {});
    writeFileSync(options.fragmentOut ?? `${options.idsFile}.out.json`, JSON.stringify(records), "utf8");
    return 0;
  }

  const selected = selectKeyboards(discovered, options);
  if (selected.length === 0) {
    console.error("[ERROR] no keyboards matched the given filters.");
    return 1;
  }
  const log = options.quiet ? (): void => {} : (line: string): void => console.log(line);

  const previous: VerificationRecord | undefined = existsSync(options.record)
    ? parseRecord(readFileSync(options.record, "utf8"))
    : undefined;
  const hashes = new Map(selected.map((k) => [k.id, hashKeyboardOnDisk(join(options.corpusRoot, k.path))]));
  const stale = staleKeyboards(previous, hashes);

  if (options.check) {
    if (stale.length === 0) {
      console.log(`[OK] ${selected.length} verification record(s) fresh (generator ${GENERATOR_VERSION})`);
      return 0;
    }
    console.error(`[ERROR] ${stale.length} of ${selected.length} verification record(s) stale or missing:`);
    for (const id of stale.slice(0, 20)) console.error(`  ${id}`);
    if (stale.length > 20) console.error(`  ... and ${stale.length - 20} more`);
    console.error(
      "Regenerate with: node utilities/nfd-tolerance-corpus/run.mjs --mode normalization-step --incremental --jobs 8",
    );
    return 1;
  }

  const staleSet = new Set(stale);
  const todo = options.incremental ? selected.filter((k) => staleSet.has(k.id)) : selected;
  log(`[INFO] verifying ${todo.length} of ${selected.length} keyboards (generator ${GENERATOR_VERSION})`);
  const started = Date.now();
  const corpusCommit = resolveCorpusCommit(options.corpusRoot);
  const writeRecord = (fresh: Record<string, KeyboardRecord>): VerificationRecord => {
    const merged = mergeRecords(previous, fresh, corpusCommit);
    mkdirSync(dirname(options.record), { recursive: true });
    writeFileSync(options.record, serializeRecord(merged), "utf8");
    return merged;
  };
  // Checkpoint after every worker batch, so an interrupted run resumes with --incremental.
  const fresh =
    options.jobs > 1 && todo.length > 1
      ? await verifyInWorkers(options, todo, log, (done) => void writeRecord(done))
      : await verifyInProcess(options, todo, log);
  const record = writeRecord(fresh);

  const tally: Record<string, number> = {};
  for (const k of selected) {
    const outcome = record.keyboards[k.id]?.outcome ?? "missing";
    tally[outcome] = (tally[outcome] ?? 0) + 1;
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`[OK] record written to ${options.record} in ${seconds}s`);
  for (const [outcome, count] of Object.entries(tally).sort()) log(`  ${outcome.padEnd(16)}${String(count).padStart(6)}`);
  const regressed = selected.filter((k) => record.keyboards[k.id]?.outcome === "regressed");
  for (const k of regressed) {
    console.error(`[WARN] regressed: ${k.id} - ${record.keyboards[k.id]?.reason ?? ""}`);
  }
  for (const k of selected.filter((x) => record.keyboards[x.id]?.outcome === "harness-error")) {
    log(`[WARN] harness-error: ${k.id} - ${record.keyboards[k.id]?.detail ?? ""}`);
  }
  if (options.failOnRegressed && regressed.length > 0) {
    console.error(`[ERROR] ${regressed.length} keyboard(s) regressed by the normalization step`);
    return 1;
  }
  return 0;
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

  if (options.mode === "normalization-step") return runNormalizationMode(options);

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
  if (options.failOnRegressed && report.buckets.regressed > 0) {
    console.error(`[ERROR] ${report.buckets.regressed} keyboard(s) regressed by the context-tolerance transform`);
    return 1;
  }
  return 0;
}
