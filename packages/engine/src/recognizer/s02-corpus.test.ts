// Corpus test for the reconciled S-02 matchers (#2233).
//
// For every `.kmn` under the sibling keymanapp/keyboards checkout
// (`../keyboards/release`), this asserts the two shipped S-02 matchers AGREE
// with each other in isolation (same family count on a fresh parse — running
// them through recognizePatterns would mask divergence, since the hand
// matcher runs first and stamps ownership), and that recognizePatterns
// completes without throwing (shared triggers/escapes must never trip the
// ownership-consistency guard). Named keyboards pin their exact family
// counts — the #2233 acceptance numbers.
//
// Full-corpus A/B evidence (keyboards-full, 933 keyboards) is recorded in
// the PR: hand == generated == combined == the ruled oracle definition on
// every keyboard; totals ≥2 families 88 → 94, ≥1 family 98 → 106.
//
// When `../keyboards` is absent (CI), every test is skipped — the same
// convention as pattern-apply/carveViaSplice.corpus.test.ts.

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/index.js";
import { recognizePatterns } from "./index.js";
import { s02Recognizer } from "./rules/s02-deadkey-single-tap.js";
import { rule as generatedRule } from "./rules/generated/deadkey-single-tap.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RELEASE_ROOT = resolve(__dir, "../../../../../keyboards/release");
const available = existsSync(RELEASE_ROOT);

/** Every `release/<shard>/<id>/source/<id>.kmn` under the corpus checkout. */
function listCorpusKmn(): { id: string; file: string }[] {
  if (!available) return [];
  const out: { id: string; file: string }[] = [];
  for (const shard of readdirSync(RELEASE_ROOT)) {
    const shardDir = join(RELEASE_ROOT, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const id of readdirSync(shardDir)) {
      const sourceDir = join(shardDir, id, "source");
      if (!existsSync(sourceDir)) continue;
      for (const f of readdirSync(sourceDir)) {
        if (f === `${id}.kmn`) out.push({ id: `${shard}/${id}`, file: join(sourceDir, f) });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const corpus = listCorpusKmn();
const byId = new Map(corpus.map((c) => [c.id, c.file]));

/** Family counts from each matcher in isolation, plus the pipeline count. */
function counts(file: string, id: string): { hand: number; gen: number; combined: number } {
  const { ir } = parse(readFileSync(file, "utf-8"), id);
  const hand = s02Recognizer.match(structuredClone(ir)).length;
  const gen = generatedRule.match(structuredClone(ir)).length;
  const { ir: out } = recognizePatterns(structuredClone(ir));
  const combined = out.recognizedPatterns.filter((p) => p.strategyId === "S-02").length;
  return { hand, gen, combined };
}

describe.skipIf(!available)("S-02 corpus agreement (#2233)", () => {
  it(
    "hand matcher and generated rule agree on every keyboard; pipeline never throws",
    () => {
      const disagreements: string[] = [];
      for (const { id, file } of corpus) {
        let c: { hand: number; gen: number; combined: number };
        try {
          c = counts(file, id);
        } catch (err) {
          disagreements.push(`${id}: threw ${String(err)}`);
          continue;
        }
        if (c.hand !== c.gen || c.combined !== c.hand) {
          disagreements.push(`${id}: hand=${c.hand} generated=${c.gen} combined=${c.combined}`);
        }
      }
      expect(disagreements).toEqual([]);
    },
    300_000,
  );

  // Named acceptance counts (each skipped when the keyboard is absent from
  // the sparse sibling checkout — sil_pan_africa_* lives only in the full
  // corpus, where the PR's sweep records hand=generated=combined=5).
  const named: { id: string; families: number }[] = [
    { id: "sil/sil_euro_latin", families: 19 },
    { id: "sil/sil_pan_africa_mnemonic", families: 5 },
    { id: "sil/sil_pan_africa_positional", families: 5 },
    { id: "basic/basic_kbdfr", families: 4 },
    { id: "basic/basic_kbdca", families: 5 },
    { id: "sil/sil_cameroon_qwerty", families: 2 },
  ];
  for (const { id, families } of named) {
    it.skipIf(!byId.has(id))(`${id}: exactly ${families} S-02 families from each matcher`, () => {
      const c = counts(byId.get(id)!, id);
      expect(c).toEqual({ hand: families, gen: families, combined: families });
    });
  }

  it("the corpus checkout was actually exercised", () => {
    // Guard against a vacuous pass if the sibling layout changes.
    expect(corpus.length).toBeGreaterThan(0);
    expect(basename(RELEASE_ROOT)).toBe("release");
  });
});
