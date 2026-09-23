// spec 062 context-variant tests, one describe per user story:
//   US1 (FR-004/FR-010/FR-011) — proposeContextVariants
//   US3 (FR-007) — context-tolerance write-back policy
//   US4 (FR-014) — backspace-unwrap variants
//   FR-011 (T022) — commit-path idempotency
// The sil_yoruba8 corpus canary stays in context-variants.sil-yoruba8.test.ts.

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import type { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import {
  proposeContextVariants,
  GENERATED_MARKER_PREFIX,
  BACKSPACE_UNWRAP_RULE_PREFIX,
  type ContextVariantsResult,
} from "./context-variants.js";
import {
  createContextToleranceMigrationRule,
  buildContextToleranceOutputDiffPreview,
  type ContextToleranceWriteBackPolicy,
} from "../facet-transform/migrations/context-tolerance.js";
import {
  kmnHeader,
  HEADER,
  GAP_KMN,
  ACUTE_KEY,
  MEASUREMENT,
  compileIr,
} from "./__fixtures__/contextTolerance.js";

describe("proposeContextVariants (spec 062, US1)", () => {
  it("generates a variant for a diagnosed gap and it fires under the decomposed form (Acceptance Scenario 1)", async () => {
    const { ir } = parse(GAP_KMN, "gap_fixture");
    const report = await computeContextTolerance(ir);
    expect(report.findings.some((f) => f.failingKeystrokes !== undefined)).toBe(true);

    const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants[0]?.kind).toBe("added-rule");
    expect(variants[0]?.generatedMarker.startsWith(GENERATED_MARKER_PREFIX)).toBe(true);

    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);

    const decomposed = "à"; // à decomposed
    const result = simulate(compiled, [{ vkey: "K_RBRKT", modifiers: [] }], { text: decomposed });
    expect(result.finalOutput).toBe("â"); // same output the precomposed rule already produced
  }, 30_000);

  it("does not change behaviour for the precomposed form (FR-004 byte-identity)", async () => {
    const { ir } = parse(GAP_KMN, "gap_fixture_precomposed");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr } = await proposeContextVariants(ir, report);

    const before = await compileIr(ir);
    const after = await compileIr(fixedIr);

    const result = (compiled: Awaited<ReturnType<typeof compile>>) =>
      simulate(compiled, [{ vkey: "K_RBRKT", modifiers: [] }], { text: "à" }).finalOutput;

    expect(result(after)).toBe(result(before));
    expect(result(after)).toBe("â");
  }, 30_000);

  it("the generated rule preempts the existing bare fallback (Acceptance Scenario 3)", async () => {
    const { ir } = parse(GAP_KMN, "gap_fixture_fallback");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);

    const fallbackVariant = variants.find((v) => v.precedesFallbackRuleId !== undefined);
    expect(fallbackVariant).toBeDefined();

    const main = fixedIr.groups.find((g) => g.name === "main")!;
    const generatedIndex = main.rules.findIndex((r) => r.nodeId === fallbackVariant!.generatedMarker);
    const fallbackIndex = main.rules.findIndex((r) => r.nodeId === fallbackVariant!.precedesFallbackRuleId);
    expect(generatedIndex).toBeGreaterThanOrEqual(0);
    expect(fallbackIndex).toBeGreaterThan(generatedIndex);

    const compiled = await compileIr(fixedIr);
    const result = simulate(compiled, [{ vkey: "K_RBRKT", modifiers: [] }], { text: "à" });
    // Must be the tolerant rule's output, never the bare fallback's literal acute-accent mark.
    expect(result.finalOutput).not.toContain("´");
    expect(result.finalOutput).toBe("â");
  }, 30_000);

  it("is idempotent — running twice produces byte-identical IR (FR-011)", async () => {
    const { ir } = parse(GAP_KMN, "gap_fixture_idempotent");
    const report = await computeContextTolerance(ir);
    const once = await proposeContextVariants(ir, report);
    const twice = await proposeContextVariants(once.ir, report);

    expect(twice.ir).toEqual(once.ir);
    expect(twice.variants).toEqual(once.variants);
  }, 30_000);

  it("never touches an opaque rule the codec could not model (FR-010)", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "U+1F600 + 'y' > 'z'",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "any(base) + any(key.act) > index(acute,1)",
      "+ ']' > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "opaque_untouched");
    expect(ir.raw).toHaveLength(1);
    const rawBefore = ir.raw[0];

    const report = await computeContextTolerance(ir);
    const { ir: fixedIr } = await proposeContextVariants(ir, report);

    expect(fixedIr.raw).toEqual([rawBefore]);
  }, 30_000);

  it("does not generate a fix for a rule reported not-analysed due to unresolved store pairing", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(mystore) U+00E2",
      "store(key.act) ']'",
      "",
      "'x' + any(key.act) > index(mystore,1)",
      "any(mystore) + any(key.act) > 'q'",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "pairing_untouched");
    const report = await computeContextTolerance(ir);
    const { variants } = await proposeContextVariants(ir, report);

    // No DIACRITIC fix variant — the store-pairing safety check must skip
    // it. `store(mystore) U+00E2` is itself a composed unit, so Story 4's
    // unconditional backspace-unwrap variant (spec 062 US4, added after this
    // test) is expected here too; it is independent of the store-pairing gap
    // this test exists to check.
    const diacriticVariants = variants.filter((v) => !v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("returns the IR unchanged (no variants) when the report has no gaps", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "+ 'a' > 'a'",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "no_gap_fixture");
    const report = await computeContextTolerance(ir);
    const { variants } = await proposeContextVariants(ir, report);
    expect(variants).toHaveLength(0);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// US3 (FR-007): write-back policy. proposeContextVariants (T008) always bakes
// the keyboard's own-form bytes; createContextToleranceMigrationRule
// (T009/T017) switches between that and the echo (NFD) form at apply() time,
// without recompiling. See migrations/context-tolerance.ts's module doc.
// ---------------------------------------------------------------------------

// a-with-circumflex, precomposed (single codepoint, U+00E2) vs. "a" +
// combining circumflex U+0302 (two codepoints) — the own-form and echo
// forms this policy switch chooses between.
const OWN_FORM_A_CIRCUMFLEX = "â";
const ECHO_A_CIRCUMFLEX = "â";

// a-with-grave, precomposed (U+00E0) vs. decomposed "a" + combining grave
// (U+0300) — the seed buffer for each test.
const PRECOMPOSED_A_GRAVE = "à";
const DECOMPOSED_A_GRAVE = "à";

async function buildResult(keyboardId: string) {
  const { ir } = parse(GAP_KMN, keyboardId);
  const report = await computeContextTolerance(ir);
  const result = await proposeContextVariants(ir, report);
  const acceptedSiteIds = result.variants.map((v) => v.sourceRuleId);
  return { result, acceptedSiteIds };
}

describe("context-tolerance write-back policy (spec 062 US3, FR-007)", () => {
  it("Acceptance Scenario 1: default (echo) emits the decomposed form, canonically equivalent to the own-form output", async () => {
    const { result, acceptedSiteIds } = await buildResult("wbp_echo_default");
    const rule = createContextToleranceMigrationRule(result); // no policy arg -> default
    const { candidateIr } = rule.apply(result.ir, acceptedSiteIds, MEASUREMENT);

    const compiled = await compileIr(candidateIr);
    expect(compiled.success).toBe(true);
    const finalOutput = simulate(compiled, [ACUTE_KEY], { text: DECOMPOSED_A_GRAVE }).finalOutput;

    expect(finalOutput).toBe(ECHO_A_CIRCUMFLEX);
    expect(finalOutput).not.toBe(OWN_FORM_A_CIRCUMFLEX);
    expect(finalOutput.normalize("NFC")).toBe(OWN_FORM_A_CIRCUMFLEX);
  }, 30_000);

  it('Acceptance Scenario 2: "own-form" rewrites the touched cluster and the consequence is disclosed via an output-diff preview', async () => {
    const { result, acceptedSiteIds } = await buildResult("wbp_own_form");
    const rule = createContextToleranceMigrationRule(result, "own-form");
    const { candidateIr } = rule.apply(result.ir, acceptedSiteIds, MEASUREMENT);

    const compiled = await compileIr(candidateIr);
    expect(compiled.success).toBe(true);
    const finalOutput = simulate(compiled, [ACUTE_KEY], { text: DECOMPOSED_A_GRAVE }).finalOutput;
    expect(finalOutput).toBe(OWN_FORM_A_CIRCUMFLEX);

    const preview = buildContextToleranceOutputDiffPreview(result, acceptedSiteIds, "own-form");
    expect(preview?.previewKind).toBe("output-diff");
    expect(preview?.outputDiff).toEqual([{ before: ECHO_A_CIRCUMFLEX, after: OWN_FORM_A_CIRCUMFLEX }]);
  }, 30_000);

  it("Acceptance Scenario 3: emitted bytes are identical under both settings when the buffer already holds the keyboard's own form", async () => {
    const echoBuild = await buildResult("wbp_precomposed_echo");
    const echoRule = createContextToleranceMigrationRule(echoBuild.result, "echo");
    const echoIr = echoRule.apply(echoBuild.result.ir, echoBuild.acceptedSiteIds, MEASUREMENT).candidateIr;

    const ownFormBuild = await buildResult("wbp_precomposed_own_form");
    const ownFormRule = createContextToleranceMigrationRule(ownFormBuild.result, "own-form");
    const ownFormIr = ownFormRule.apply(ownFormBuild.result.ir, ownFormBuild.acceptedSiteIds, MEASUREMENT).candidateIr;

    const echoCompiled = await compileIr(echoIr);
    const ownFormCompiled = await compileIr(ownFormIr);
    const echoOutput = simulate(echoCompiled, [ACUTE_KEY], { text: PRECOMPOSED_A_GRAVE }).finalOutput;
    const ownFormOutput = simulate(ownFormCompiled, [ACUTE_KEY], { text: PRECOMPOSED_A_GRAVE }).finalOutput;

    expect(echoOutput).toBe(ownFormOutput);
    expect(echoOutput).toBe(OWN_FORM_A_CIRCUMFLEX);
  }, 30_000);

  it('buildContextToleranceOutputDiffPreview returns undefined for "echo" (nothing is rewritten)', async () => {
    const { result, acceptedSiteIds } = await buildResult("wbp_no_preview_for_echo");
    expect(buildContextToleranceOutputDiffPreview(result, acceptedSiteIds, "echo")).toBeUndefined();
  }, 30_000);
});

// ---------------------------------------------------------------------------
// US4 (FR-014): backspace-unwrap variants for addBackspaceUnwrap (T020) — see
// its module doc in context-variants.ts.
// ---------------------------------------------------------------------------

const BKSP_HEADER = kmnHeader("BackspaceUnwrap", { mnemonic: false });

// U+1EC7 LATIN SMALL LETTER E WITH CIRCUMFLEX AND DOT BELOW ("ệ") — a real
// two-mark precomposed unit. Its NFD is three code points (base + two
// combining marks, canonically ordered by combining class — below before
// above, so dot-below precedes circumflex, not typing order); the
// one-mark-shorter predecessor is computed the same way the generator
// computes it (drop the canonically-LAST mark, recompose), rather than
// hand-typing the expected glyph and risking exactly the canonical-ordering
// mistake this feature exists to get right.
const TWO_MARK_PRECOMPOSED = "ệ";
const TWO_MARK_NFD = [...TWO_MARK_PRECOMPOSED.normalize("NFD")];
const ONE_MARK_SHORTER_PRECOMPOSED = TWO_MARK_NFD.slice(0, -1).join("").normalize("NFC");

// A keyboard that merely OUTPUTS the two-mark unit somewhere (attesting it
// to the generator) — it defines no backspace rule of its own, matching a
// typical imported keyboard with no hand-written unwrap table.
const KMN_NO_BKSP_RULE = [
  BKSP_HEADER,
  "group(main) using keys",
  "",
  `+ [K_E] > U+1EC7`,
  "",
].join("\n");

const BKSP_KEY = { vkey: "K_BKSP", modifiers: [] as const };

describe("addBackspaceUnwrap (spec 062 US4, FR-014)", () => {
  it("Acceptance Scenario 1: a single backspace loses exactly one mark from either canonical form, landing in canonically-equivalent states", async () => {
    const { ir } = parse(KMN_NO_BKSP_RULE, "bksp_scenario1");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);
    expect(variants.some((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX))).toBe(true);

    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);

    const decomposed = TWO_MARK_PRECOMPOSED.normalize("NFD");
    const decomposedResult = simulate(compiled, [BKSP_KEY], { text: decomposed }).finalOutput;
    const precomposedResult = simulate(compiled, [BKSP_KEY], { text: TWO_MARK_PRECOMPOSED }).finalOutput;

    // Both land on the same one-mark-shorter form — canonically equivalent,
    // and each has lost exactly one mark: Unicode's canonical ordering sorts
    // combining marks by combining class (below before above), so the
    // CANONICALLY-last mark this generator drops is the circumflex (class
    // 230, above), not the dot-below (class 220, below) — the result keeps
    // the dot-below, not the circumflex. See this file's own module doc and
    // context-variants.ts's "canonical order vs. typing order" limitation
    // note for why this is spec-compliant but not necessarily what a native
    // speaker of a language stacking marks in the opposite order would
    // expect from backspace.
    expect(decomposedResult).toBe(ONE_MARK_SHORTER_PRECOMPOSED);
    expect(precomposedResult).toBe(ONE_MARK_SHORTER_PRECOMPOSED);
    expect(decomposedResult.normalize("NFC")).toBe(precomposedResult.normalize("NFC"));
  }, 30_000);

  it("Acceptance Scenario 2: backspace against a decomposed accented letter removes exactly one mark, not the whole cluster", async () => {
    const { ir } = parse(KMN_NO_BKSP_RULE, "bksp_scenario2");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr } = await proposeContextVariants(ir, report);

    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);

    // A host that deletes a whole grapheme cluster per backspace would, with
    // NO rule intervening, remove all three decomposed code points at once,
    // landing on "" (or on native per-codepoint hosts, on "e" + circumflex
    // minus circumflex too if it deleted two). The generated rule fires
    // FIRST, matching the full three-code-point decomposed context, so the
    // simulated result — which always applies the compiled keyboard's own
    // rules, never a host's grapheme-cluster heuristic — is the one-mark-
    // shorter precomposed form, proving the mark was removed one at a time
    // by the KEYBOARD, not left to whatever the host's cluster boundary is.
    const decomposed = TWO_MARK_PRECOMPOSED.normalize("NFD");
    const result = simulate(compiled, [BKSP_KEY], { text: decomposed }).finalOutput;
    expect(result).toBe(ONE_MARK_SHORTER_PRECOMPOSED);
    expect([...result].length).toBeGreaterThan(0);
  }, 30_000);

  it("is idempotent — running twice produces byte-identical IR (FR-011)", async () => {
    const { ir } = parse(KMN_NO_BKSP_RULE, "bksp_idempotent");
    const report = await computeContextTolerance(ir);
    const once = await proposeContextVariants(ir, report);
    const twice = await proposeContextVariants(once.ir, report);

    expect(twice.ir).toEqual(once.ir);
    expect(twice.variants).toEqual(once.variants);
  }, 30_000);

  it("generates no backspace-unwrap variant when no composed multi-mark unit is attested", async () => {
    const kmn = [BKSP_HEADER, "group(main) using keys", "", "+ 'a' > 'a'", ""].join("\n");
    const { ir } = parse(kmn, "bksp_no_units");
    const report = await computeContextTolerance(ir);
    const { variants } = await proposeContextVariants(ir, report);
    expect(variants.some((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX))).toBe(false);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// FR-011 (T022): running proposeContextVariants + commit twice against the
// same starting IR produces byte-identical resulting IR. The US1 describe
// proves this for proposeContextVariants() in isolation; these exercise the
// SAME invariant end-to-end through the commit path
// (createContextToleranceMigrationRule.apply()), since a re-run must
// recognize and replace its own previously-committed rules, not just its own
// previously-PROPOSED (never-committed) ones.
// ---------------------------------------------------------------------------

async function proposeAndCommit(
  ir: KeyboardIR,
  writeBackPolicy?: ContextToleranceWriteBackPolicy,
): Promise<{ ir: KeyboardIR; result: ContextVariantsResult }> {
  const report = await computeContextTolerance(ir);
  const result = await proposeContextVariants(ir, report);
  const acceptedSiteIds = result.variants.map((v) => v.sourceRuleId);
  const rule = createContextToleranceMigrationRule(result, writeBackPolicy);
  return { ir: rule.apply(result.ir, acceptedSiteIds, MEASUREMENT).candidateIr, result };
}

async function commitOnce(ir: KeyboardIR): Promise<KeyboardIR> {
  return (await proposeAndCommit(ir)).ir;
}

describe("context-tolerance commit idempotency (spec 062 FR-011, T022)", () => {
  it("committing twice against the same starting IR produces byte-identical IR", async () => {
    const { ir } = parse(GAP_KMN, "idempotent_commit");
    const once = await commitOnce(ir);
    const twice = await commitOnce(once);
    expect(twice).toEqual(once);
  }, 30_000);

  it('re-diagnosing after an "own-form" commit reports the fixed diacritic rule as tolerant again', async () => {
    const { ir } = parse(GAP_KMN, "idempotent_report_own_form");
    const firstReport = await computeContextTolerance(ir);
    const diacriticRuleId = firstReport.findings.find((f) => f.failingKeystrokes !== undefined)?.ruleId;
    expect(diacriticRuleId).toBeDefined();

    const { ir: committed } = await proposeAndCommit(ir, "own-form");
    const secondReport = await computeContextTolerance(committed);
    // "own-form" rewrites the decomposed path's output to be byte-identical
    // to the precomposed path's — the diagnostic's plain byte-equality check
    // (computeContextTolerance never re-derives canonical equivalence, only
    // exact-match) sees the rule as tolerant again.
    expect(secondReport.findings.find((f) => f.ruleId === diacriticRuleId)?.status).toBe("tolerant");
  }, 30_000);

  it('re-diagnosing after the default ("echo") commit still reports a byte-level gap, canonically equivalent by design', async () => {
    const { ir } = parse(GAP_KMN, "idempotent_report_echo");
    const firstReport = await computeContextTolerance(ir);
    const diacriticRuleId = firstReport.findings.find((f) => f.failingKeystrokes !== undefined)?.ruleId;
    expect(diacriticRuleId).toBeDefined();

    const { ir: committed } = await proposeAndCommit(ir); // default: "echo"
    const secondReport = await computeContextTolerance(committed);
    const finding = secondReport.findings.find((f) => f.ruleId === diacriticRuleId);
    // "echo" deliberately keeps the decomposed path's output decomposed
    // (FR-007) rather than rewriting it to match the precomposed path's own
    // form — so computeContextTolerance's byte-exact comparison (it has no
    // notion of canonical equivalence; that's this feature's own job, one
    // layer up) still reports a gap. The two outputs are nonetheless
    // canonically equivalent — the actual guarantee Story 1 makes — which is
    // the property this assertion checks instead of byte identity.
    expect(finding?.status).toBe("not-analysed");
    expect(finding?.failingKeystrokes).toBeDefined();
    expect(finding?.precomposedOutput?.normalize("NFC")).toBe(finding?.decomposedOutput?.normalize("NFC"));
  }, 30_000);
});
