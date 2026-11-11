/**
 * Local patch 3 (FIRST-set prediction in recursive-descent.ts) must not change
 * any parse result. Every NEWLINE-terminated line is parsed with LineRule twice,
 * prediction off (every alternative tried, as upstream) and on, and the
 * acceptance flag plus the AST's toString() must match.
 *
 * Checked over every corpus .kmn (root: env KS_KEYBOARDS, else the sibling
 * `keyboards` checkout; skipped with a [WARN] when absent) and over seeded
 * random lines built from the lexer's vocabulary.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Lexer, Token } from "./lexer.js";
import { TokenBuffer } from "./token-buffer.js";
import { LineRule } from "./kmn-analyzer.js";
import { ASTNode } from "./tree-construction.js";
import { NodeType } from "./node-type.js";
import { TokenType } from "./token-type.js";
import { Rule } from "./recursive-descent.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env["KS_KEYBOARDS"] ?? path.resolve(__dir, "../../../../../../keyboards");
const rootExists = fs.existsSync(path.join(ROOT, "release"));

if (!rootExists) {
  console.warn(`[WARN] keyboards corpus not found at ${ROOT}; skipping the corpus part of the parser equivalence check`);
}

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

const lineRule = new LineRule();

function parseLine(tokens: Token[], predict: boolean): string {
  Rule.prediction = predict;
  const root = new ASTNode(NodeType.ROOT);
  const ok = lineRule.parse(new TokenBuffer(tokens), root);
  return `${ok ? "1" : "0"}${root.toString()}`;
}

/** First line whose parse differs with prediction off vs on, or null. */
function compareText(text: string, label: string): string | null {
  const tokens = new Lexer(text).parse();
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.tokenType !== TokenType.NEWLINE) continue;
    const line = tokens.slice(start, i + 1);
    start = i + 1;
    const ref = parseLine(line, false);
    const got = parseLine(line, true);
    if (ref !== got) return `${label} line ${line[0]?.lineNum}: reference ${ref} vs predicted ${got}`;
  }
  return null;
}

afterEach(() => {
  Rule.prediction = true;
});

describe.skipIf(!rootExists)("predicting parser equals the upstream parser (corpus)", () => {
  it("builds an identical AST for every line of every corpus .kmn", () => {
    const failures: string[] = [];
    let count = 0;
    for (const tree of ["release", "experimental"]) {
      for (const file of walkKmn(path.join(ROOT, tree))) {
        count++;
        const d = compareText(fs.readFileSync(file, "utf8"), path.relative(ROOT, file));
        if (d) failures.push(d);
        if (failures.length >= 5) break;
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  }, 600_000);
});

describe("predicting parser equals the upstream parser (seeded random lines)", () => {
  const pieces = [
    "store(x) ", "'abc' ", "\"q\" ", "+ ", "> ", "[K_A] ", "[SHIFT K_A] ", "[CTRL RALT K_B] ", "any(x) ",
    "index(x,2) ", "context ", "context(1) ", "dk(a) ", "deadkey(b) ", "use(main) ", "call(x) ", "outs(x) ",
    "beep ", "nul ", "match ", "nomatch ", "begin ", "Unicode ", "group(main) ", "using keys ", "readonly ",
    "if(&platform = 'touch') ", "if(x != 'y') ", "platform('touch') ", "layer('shift') ", "baselayout('en-US') ",
    "set(x = 'y') ", "save(x) ", "reset(x) ", "notany(x) ", "return ", "U+0041 ", "U+1F600 ", "U+0041 .. U+0045 ",
    "'a' .. 'e' ", "$keymanonly: ", "$keymanweb: ", "&name ", "&version ", "&casedkeys ", "x41 ", "d65 ",
    "( ", ") ", ", ", "= ", "!= ", "c comment ",
  ];
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  it("builds an identical AST for 5000 random lines", () => {
    const rand = rng(116);
    const failures: string[] = [];
    for (let i = 0; i < 5000; i++) {
      const n = 1 + Math.floor(rand() * 12);
      let text = "";
      for (let j = 0; j < n; j++) text += pieces[Math.floor(rand() * pieces.length)] ?? "";
      const d = compareText(`${text}\n`, `random#${i} ${JSON.stringify(text)}`);
      if (d) failures.push(d);
      if (failures.length >= 5) break;
    }
    expect(failures).toEqual([]);
  });
});
