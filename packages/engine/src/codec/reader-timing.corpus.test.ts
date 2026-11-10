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

describe.skipIf(!rootExists)("reader speed budget (lex + per-line parse)", () => {
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
});
