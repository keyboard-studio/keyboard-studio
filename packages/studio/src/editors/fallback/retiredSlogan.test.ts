// The one-sided allow/block slogan is retired (spec 076 A1/A2, design §2/§6)
// and must appear nowhere in packages/** — copy, tests, or comments. Each
// option states its own risk; neither is framed as the predictable one.
//
// The slogan and its paraphrases are built from parts so this file does not
// match itself; it is also excluded from the scan by path.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(here, "..", "..", "..", "..");
const SELF = path.resolve(fileURLToPath(import.meta.url));

const A = "al" + "low";
const B = "blo" + "ck";
const UNP = "un" + "predict" + "able";
const PRED = "predict" + "able";

// "<allow> [means|is|=] <unpredictable>" and "<block> [means|is|=] <predictable>",
// with optional punctuation between, case-insensitive.
const verb = String.raw`(?:\s*(?:means?|is|=|:|-)\s*|\s+)`;
const PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b${A}\\w*${verb}${UNP}`, "i"),
  new RegExp(`\\b${B}\\w*${verb}${PRED}`, "i"),
  new RegExp(`\\b${A}\\w*${verb}${PRED}`, "i"),
  new RegExp(`\\b${B}\\w*${verb}${UNP}`, "i"),
];

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".turbo", ".vite"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".po", ".css", ".html"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (TEXT_EXT.has(path.extname(name))) yield full;
  }
}

describe("retired one-sided allow/block slogan", () => {
  it("appears nowhere in packages/** (source, copy, tests, comments)", () => {
    const offenders: string[] = [];
    for (const file of walk(packagesDir)) {
      if (path.resolve(file) === SELF) continue;
      // Collapse whitespace and comment leaders so a wrapped comment still matches.
      const text = readFileSync(file, "utf8").replace(/\s*\n\s*(?:\/\/|\*|#)?\s*/g, " ");
      if (PATTERNS.some((re) => re.test(text))) offenders.push(path.relative(packagesDir, file));
    }
    expect(offenders).toEqual([]);
  });

  it("the detector itself catches the slogan and obvious paraphrases", () => {
    const hit = (s: string) => PATTERNS.some((re) => re.test(s));
    expect(hit(`${A} means ${UNP}; ${B} means ${PRED}.`)).toBe(true);
    expect(hit(`Allow is ${UNP}`)).toBe(true);
    expect(hit(`${B}: ${PRED}`)).toBe(true);
    expect(hit(`allowing ${UNP} output`)).toBe(true);
    expect(hit("Do nothing. Silent on every computer.")).toBe(false);
  });
});
