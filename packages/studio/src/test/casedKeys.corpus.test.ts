// Criterion 7.28 corpus sweep (spec 112, SC-001): every .kmn under
// ../keyboards/release and experimental parses and lands in exactly one
// class. Prints the counts. Skips with a reason when the sibling corpus is
// absent. Lives in the studio package because it needs both the engine's
// parser and keyboard-lint's check, which do not depend on each other.
//
// Runs under vitest.corpus.config.ts.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKmn } from "@keyboard-studio/engine";
import { checkCasedKeysDeclared } from "@keymanapp/keyboard-lint";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = resolve(here, "..", "..", "..", "..", "..", "keyboards");
const roots = ["release", "experimental"].map((d) => join(corpus, d)).filter((d) => existsSync(d));

if (roots.length === 0) {
  console.warn(`[WARN] keyboards corpus not found at ${corpus}; skipping the 7.28 corpus sweep`);
}

function* walkKmn(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkKmn(p);
    else if (e.name.toLowerCase().endsWith(".kmn")) yield p;
  }
}

type Klass =
  | "fail-missing"
  | "fail-incomplete"
  | "pass-declared"
  | "not-applicable-caseless"
  | "not-applicable-mnemonic";

describe.skipIf(roots.length === 0)("7.28 cased keys corpus sweep", () => {
  it("every keyboard parses and lands in exactly one class", () => {
    const counts: Record<Klass, number> = {
      "fail-missing": 0,
      "fail-incomplete": 0,
      "pass-declared": 0,
      "not-applicable-caseless": 0,
      "not-applicable-mnemonic": 0,
    };
    const parseErrors: string[] = [];
    let total = 0;
    for (const root of roots) {
      for (const file of walkKmn(root)) {
        total++;
        const id = basename(file, ".kmn");
        let klass: Klass;
        try {
          const { ir } = parseKmn(readFileSync(file, "utf8"), id);
          const r = checkCasedKeysDeclared(ir, id);
          if (r.findings.length > 0) {
            klass = r.findings[0]!.message.includes("misses keys") ? "fail-incomplete" : "fail-missing";
          } else if (r.verified.some((v) => v.startsWith("Mnemonic"))) klass = "not-applicable-mnemonic";
          else if (r.verified.some((v) => v.startsWith("No cased"))) klass = "not-applicable-caseless";
          else klass = "pass-declared";
        } catch (err) {
          parseErrors.push(`${file}: ${(err as Error).message}`);
          continue;
        }
        counts[klass]++;
      }
    }
    console.log(`[7.28 corpus] total=${total} ${JSON.stringify(counts)} parseErrors=${parseErrors.length}`);
    expect(parseErrors).toEqual([]);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(total);
  }, 600_000);
});
