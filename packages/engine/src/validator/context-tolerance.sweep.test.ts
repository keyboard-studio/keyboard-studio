// spec 062 (T023): proves SC-001 and SC-006 together over a fixture keyboard
// with several attested base+mark pairs — not just the single-pair fixture
// context-variants.test.ts already exercises. SC-001 is explicit that the
// canonical-equivalence guarantee is "measured across the whole inventory,
// not a sample," so this test sweeps every attested pair, not just one.

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance } from "./context-tolerance.js";
import { proposeContextVariants } from "../pattern-apply/context-variants.js";
import { createContextToleranceMigrationRule } from "../facet-transform/migrations/context-tolerance.js";

const HEADER = [
  "store(&NAME) 'ContextToleranceSweep'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

// Three attested base+mark pairs (grave vowel -> its circumflex counterpart),
// mirroring the real sil_yoruba8 shape (any(base) + any(key.act) >
// index(acute,1)) but with a whole small inventory instead of one pair, so
// SC-001's "measured across the whole inventory, not a sample" is actually
// exercised.
const SWEEP_KMN = [
  HEADER,
  "group(main) using keys",
  "",
  "store(base) U+00E0 U+00E8 U+00F2", // à è ò (grave vowels, each decomposable)
  "store(acute) U+00E2 U+00EA U+00F4", // â ê ô (circumflex counterparts)
  "store(key.act) ']'",
  "",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

const BASE_VOWELS = ["à", "è", "ò"];
const ACUTE_KEY = { vkey: "K_RBRKT", modifiers: [] as const };

const MEASUREMENT = {
  facetId: "context-tolerance",
  dominantValue: "not-tolerant",
  confidenceClass: "confident" as const,
  consistency: 1,
  exceptionSites: [],
  evidenceSize: 1,
};

async function compileIr(ir: KeyboardIR) {
  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(ir), isBinary: false },
  ]);
  return compile(vfs, ir.header.keyboardId);
}

describe("context-tolerance inventory sweep (spec 062 SC-001 + SC-006, T023)", () => {
  it("SC-006: the report accounts for 100% of the keyboard's rules", async () => {
    const { ir } = parse(SWEEP_KMN, "sweep_sc006");
    const report = await computeContextTolerance(ir);
    const totalRuleCount = ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length;
    expect(report.findings.length + report.notAnalysedCount).toBe(totalRuleCount);
    // At least the diacritic rule and the bare fallback are accounted for.
    expect(report.findings.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("SC-001: every attested base+mark pair produces a canonically-equivalent result from either starting form, after variants are applied", async () => {
    const { ir } = parse(SWEEP_KMN, "sweep_sc001");
    const report = await computeContextTolerance(ir);
    expect(report.findings.some((f) => f.failingKeystrokes !== undefined)).toBe(true);

    const result = await proposeContextVariants(ir, report);
    const acceptedSiteIds = result.variants.map((v) => v.sourceRuleId);
    const rule = createContextToleranceMigrationRule(result); // default: "echo"
    const { candidateIr } = rule.apply(result.ir, acceptedSiteIds, MEASUREMENT);

    const compiled = await compileIr(candidateIr);
    expect(compiled.success).toBe(true);

    for (const vowel of BASE_VOWELS) {
      const decomposed = vowel.normalize("NFD");
      const precomposedOutput = simulate(compiled, [ACUTE_KEY], { text: vowel }).finalOutput;
      const decomposedOutput = simulate(compiled, [ACUTE_KEY], { text: decomposed }).finalOutput;

      // Every pair in the inventory, not just one — canonically equivalent
      // (SC-001), never the bare fallback's spacing accent (SC-003).
      expect(decomposedOutput.normalize("NFC")).toBe(precomposedOutput.normalize("NFC"));
      expect(decomposedOutput).not.toContain("´");
      expect(precomposedOutput).not.toContain("´");
    }
  }, 30_000);
});
