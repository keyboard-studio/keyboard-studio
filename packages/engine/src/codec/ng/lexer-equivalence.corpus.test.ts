/**
 * The patched Lexer (first-character dispatch, no per-token line concatenation,
 * optional trivia callback) must emit exactly the token stream of the unpatched
 * upstream Lexer, kept as test-only reference code in lexer-reference.testkit.ts.
 *
 * Checked over every corpus .kmn (root: env KS_KEYBOARDS, else the sibling
 * `keyboards` checkout; skipped with a [WARN] when absent) and over seeded
 * random inputs built from the lexer's own vocabulary.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Lexer, Token } from "./lexer.js";
import { ReferenceLexer } from "./lexer-reference.testkit.js";
import { KMN_SCAN_RECOGNIZERS } from "./scan-recognizer.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; skipping the corpus part of the lexer equivalence check`);
}

type Plain = [string, string, number, number, string | null, string | null];
const plain = (t: Token): Plain => [t.tokenType, t.text, t.lineNum, t.charNum, t.line, t.filename];

const MODES = [
  { addEOF: true, emitAll: false, handleContinuation: true },
  { addEOF: true, emitAll: true, handleContinuation: false },
  { addEOF: false, emitAll: false, handleContinuation: false },
];

function* walkKmn(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "build") yield* walkKmn(full);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".kmn")) {
      yield full;
    }
  }
}

/** First difference between two token streams, as a readable string, or null. */
function firstDiff(a: Plain[], b: Plain[]): string | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      return `token ${i}: reference ${JSON.stringify(a[i])} vs patched ${JSON.stringify(b[i])}`;
    }
  }
  return null;
}

function compareAll(text: string, label: string): string | null {
  for (const mode of MODES) {
    const ref = new ReferenceLexer(text).parse(mode).map(plain);
    const got = new Lexer(text).parse(mode).map(plain);
    const d = firstDiff(ref, got);
    if (d) return `${label} ${JSON.stringify(mode)}: ${d}`;
    // With a callback: identical tokens, and the callback sees every emit:false token in order.
    const trivia: Plain[] = [];
    const withCb = new Lexer(text, undefined, (t) => trivia.push(plain(t))).parse(mode).map(plain);
    const d2 = firstDiff(ref, withCb);
    if (d2) return `${label} (onTrivia) ${JSON.stringify(mode)}: ${d2}`;
    const expected = new ReferenceLexer(text)
      .parse({ addEOF: false, emitAll: true, handleContinuation: false })
      .filter((t) => KMN_SCAN_RECOGNIZERS.some((r) => r.tokenType === t.tokenType && !r.emit))
      .map(plain)
      .map((p): Plain => [p[0], p[1], p[2], p[3], null, null]);
    if (!mode.emitAll && !mode.handleContinuation && !mode.addEOF) {
      const seen = trivia.map((p): Plain => [p[0], p[1], p[2], p[3], null, null]);
      const d3 = firstDiff(expected, seen);
      if (d3) return `${label} trivia order: ${d3}`;
    }
  }
  return null;
}

describe.skipIf(!rootExists)("patched lexer equals the upstream lexer (corpus)", () => {
  it("emits an identical token stream for every corpus .kmn", () => {
    const failures: string[] = [];
    let count = 0;
    for (const tree of ["release", "experimental"]) {
      for (const file of walkKmn(path.join(ROOT, tree))) {
        count++;
        const text = fs.readFileSync(file, "utf8");
        const d = compareAll(text, path.relative(ROOT, file));
        if (d) failures.push(d);
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 600_000);
});

describe("patched lexer equals the upstream lexer (seeded random input)", () => {
  const pieces = [
    "&baselayout ", "&bitmap", "&casedkeys", "&copyright", "&name", "&version ", "match", "nomatch", "notany(x)",
    "reset(x)", "return", "save(x)", "set(x)", "store(x)", "use(x)", "unicode", "newcontext", "postkeystroke",
    "ansi", "readonly", "using", "keys", "dk(x)", "deadkey (x)", "any(x)", "index(a,1)", "context(1)", "platform(touch)", "layer(x)", "$keymanonly:", "$keymanweb:", "$kmfl:", "$weaver:", "$$", "$HANGUL_SYLLABLE_ABC",
    "(", ")", "[", "]", ">", "+", ",", "!=", "=", "..", "U+41", "SHIFT ", "ctrl ", "K_A", "T_X", "A01", "C01",
    "store(x) 'abc' ", "+ [K_A] > 'b'\n", "c a comment\n", "c\n", "  ", "\t", "\\\n", "\r\n", "\r", "\n",
    "begin Unicode > use(main)\n", "group(main) using keys\n", "U+1F600 ", "$keyman: ", "x41 ", "d65 ", "17 ",
    "[SHIFT K_A] ", "[K_C]", "'it''s", "\"q\"", "()", "( )", "é", "\u00a0", "\u2003", "\ufeff", "Ǆ", "any(a) ",
    "outs(a)", "nul ", "if(&x = 'y') ", "&name ", "NAME ", "A", "z", "9",
  ];
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  it("emits an identical token stream for 3000 random inputs", () => {
    const rand = rng(116);
    const failures: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const n = 1 + Math.floor(rand() * 40);
      let text = "";
      for (let j = 0; j < n; j++) text += pieces[Math.floor(rand() * pieces.length)] ?? "";
      const d = compareAll(text, `random#${i} ${JSON.stringify(text)}`);
      if (d) failures.push(d);
      if (failures.length >= 5) break;
    }
    expect(failures).toEqual([]);
  }, 30_000); // 3000 inputs x 6+ lexer parses each: ~6.1s locally, 8.5s on CI — over vitest's 5s default (main CI run 43140522180 timed out at 5000ms with no assertion failure).

  it("emits an identical token stream for every single character of the Latin-1 range", () => {
    const failures: string[] = [];
    for (let c = 0; c < 256; c++) {
      const ch = String.fromCharCode(c);
      for (const text of [ch, `${ch}x`, `x${ch}`, `store(${ch})`, `[${ch}]`]) {
        const d = compareAll(text, `char ${c}`);
        if (d) failures.push(d);
      }
    }
    expect(failures).toEqual([]);
  });
});
