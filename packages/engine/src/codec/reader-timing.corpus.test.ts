/**
 * Records the parse() timing baseline over the keyboards corpus into
 * specs/116-ng-parser-adoption/evidence/baseline.md (only when the section
 * is absent, or KS_RECORD_BASELINE=1, so the recorded baseline stays fixed),
 * and asserts the reader speed budget against that baseline:
 * total <= 2 x baseline and slowest file <= 300 ms.
 *
 * Root: env KS_KEYBOARDS when set, else the sibling `keyboards` checkout.
 * Skipped with a [WARN] when the corpus is absent.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./parse.js";
import { timeReader } from "./reader-timing.js";
import { Lexer } from "./ng/lexer.js";
import { TokenBuffer } from "./ng/token-buffer.js";
import { LineRule } from "./ng/kmn-analyzer.js";
import { ASTNode } from "./ng/tree-construction.js";
import { NodeType } from "./ng/node-type.js";
import { TokenType } from "./ng/token-type.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));
const EVIDENCE = path.resolve(__dir, "../../../../specs/116-ng-parser-adoption/evidence/baseline.md");
const MARKER = "## parse() timing baseline";

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; skipping the reader timing baseline`);
}

describe.skipIf(!rootExists)("reader timing baseline (parse)", () => {
  it("records the current parse() timing over release/ and experimental/", () => {
    const t = timeReader(ROOT, parse);
    expect(t.fileCount).toBeGreaterThan(0);
    const section = [
      MARKER,
      "",
      `- files timed: ${t.fileCount}`,
      `- total: ${t.totalMs.toFixed(0)} ms`,
      `- slowest: ${t.slowest.file} (${t.slowest.ms.toFixed(1)} ms)`,
      "",
    ].join("\n");
    const existing = fs.existsSync(EVIDENCE) ? fs.readFileSync(EVIDENCE, "utf8") : "";
    const idx = existing.indexOf(MARKER);
    if (idx >= 0 && process.env["KS_RECORD_BASELINE"] !== "1") return; // keep the recorded baseline fixed
    const head = idx >= 0 ? existing.slice(0, idx) : existing.length > 0 ? existing.replace(/\n*$/, "\n\n") : "";
    fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
    fs.writeFileSync(EVIDENCE, head + section);
    console.log(`[OK] parse() baseline: ${t.fileCount} files, ${t.totalMs.toFixed(0)} ms, slowest ${t.slowest.file}`);
  }, 300_000);
});

const BUDGET_SLOWEST_MS = 300;
const BUDGET_FACTOR = 2;
/** Full reader path (T040): owner-accepted total factor and per-MB file cap. */
const FULL_PATH_FACTOR = 2.5;
const FULL_PATH_MS_PER_MB = 150;

/** The recorded baseline total (ms), from the evidence file. */
function recordedBaselineTotalMs(): number {
  const text = fs.readFileSync(EVIDENCE, "utf8");
  const m = /- total: (\d+) ms/.exec(text.slice(text.indexOf(MARKER)));
  if (!m) throw new Error("baseline total not recorded in baseline.md");
  return Number(m[1]);
}

/** Vendored front end only: lex once, then parse each NEWLINE-terminated slice with LineRule. */
const lineRule = new LineRule();
function lexAndParseLines(text: string): unknown {
  const tokens = new Lexer(text).parse();
  let start = 0;
  let accepted = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.tokenType === TokenType.NEWLINE) {
      if (lineRule.parse(new TokenBuffer(tokens.slice(start, i + 1)), new ASTNode(NodeType.ROOT))) accepted++;
      start = i + 1;
    }
  }
  return accepted;
}

// Opt-in with KS_CORPUS_PERF=1, like spec 086's generation-time budget: a timing
// budget is only meaningful when nothing else competes for the CPU, so CI runs
// it in its own step rather than inside the parallel corpus sweep.
const perfRun = process.env["KS_CORPUS_PERF"] === "1";

describe.skipIf(!rootExists || !perfRun)("reader speed budget (lex + per-line parse)", () => {
  // The T031 speed gate: met after local patches 1 and 3 (PROVENANCE.md). See research R1.
  it("lexing plus per-line parsing stays within 2x baseline total and 300 ms per file", () => {
    const baseline = recordedBaselineTotalMs();
    const t = timeReader(ROOT, lexAndParseLines);
    console.log(
      `[OK] lex+line-parse: ${t.totalMs.toFixed(0)} ms total (baseline ${baseline} ms, budget ${BUDGET_FACTOR * baseline} ms), ` +
        `slowest ${t.slowest.file} ${t.slowest.ms.toFixed(1)} ms (budget ${BUDGET_SLOWEST_MS} ms)`,
    );
    expect(t.totalMs).toBeLessThanOrEqual(BUDGET_FACTOR * baseline);
    expect(t.slowest.ms).toBeLessThanOrEqual(BUDGET_SLOWEST_MS);
  }, 300_000);

  // T040: the full reader path, parse() = lex + parse + lower. Owner rulings
  // (2026-11-10): a missed per-file cap scales by size, so each file's cap is
  // max(300 ms, 150 ms per MB); and the measured total (2.5-2.6 s under vitest,
  // about 2.3x baseline) was accepted as close enough, so the full path's total
  // budget is 2.5x baseline. See research R1.
  it("the full reader (parse) stays within 2.5x baseline total and the per-MB file cap", () => {
    const baseline = recordedBaselineTotalMs();
    const t = timeReader(ROOT, (text, id) => parse(text, id));
    const capFor = (file: string): number =>
      Math.max(BUDGET_SLOWEST_MS, FULL_PATH_MS_PER_MB * (fs.statSync(path.join(ROOT, file)).size / 1_000_000));
    const over = t.perFile.filter((p) => p.ms > capFor(p.file)).map((p) => `${p.file} ${p.ms.toFixed(0)} ms (cap ${capFor(p.file).toFixed(0)} ms)`);
    console.log(
      `[OK] parse() full path: ${t.totalMs.toFixed(0)} ms total (baseline ${baseline} ms, budget ${(FULL_PATH_FACTOR * baseline).toFixed(0)} ms), ` +
        `slowest ${t.slowest.file} ${t.slowest.ms.toFixed(1)} ms (cap ${capFor(t.slowest.file).toFixed(0)} ms)`,
    );
    expect(t.totalMs).toBeLessThanOrEqual(FULL_PATH_FACTOR * baseline);
    expect(over).toEqual([]);
  }, 300_000);
});
