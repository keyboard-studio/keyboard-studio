// spec 062 context-variant tests, one describe per user story:
//   US1 (FR-004/FR-010/FR-011) — proposeContextVariants
//   US3 (FR-007) — context-tolerance write-back policy
//   US4 (FR-014) — backspace-unwrap variants
//   FR-011 (T022) — commit-path idempotency
//   FR-013 — backspace unwrap skipped on mnemonic web layouts
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
  BACKSPACE_UNWRAP_SKIPPED_MNEMONIC_WEB_NOTE,
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
    // it. Backspace-unwrap variants (spec 062 US4) are filtered out because
    // they are independent of the store-pairing gap this test exists to
    // check (this mnemonic web fixture gets none anyway — see the
    // "mnemonic layouts" describe block below).
    const diacriticVariants = variants.filter((v) => !v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("resolves each member of a multi-key any() store to its own literal key and output (#1753)", async () => {
    // Regression for #1753: a multi-member key store (`any(key.all)`, real
    // shape e.g. sil_yoruba8's `any(key.all)` acute/grave/tilde/... table)
    // selects a DIFFERENT physical key per member. Before this fix, the
    // generator resolved only the first member's key, simulated the fix's
    // output against just that key, and then emitted a generated rule whose
    // context still matched `any(key.all)` (every member) — silently
    // overwriting every other member's correct output with the first
    // member's. Each member must get its own literal key and its own
    // simulated output.
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(key.all) '[' ']' ';'",
      "store(act.all) U+00E2 U+00E1 U+00E3",
      "",
      "any(base) + any(key.all) > index(act.all,2)",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "multi_key_fixture");
    const report = await computeContextTolerance(ir);
    expect(report.findings.some((f) => f.failingKeystrokes !== undefined)).toBe(true);

    const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);
    const diacriticVariants = variants.filter((v) => !v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
    expect(diacriticVariants).toHaveLength(3);

    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);

    const decomposedBase = "à"; // a + combining grave, decomposed U+00E0
    const expectations: Array<[{ vkey: string; modifiers: [] }, string]> = [
      [{ vkey: "K_LBRKT", modifiers: [] }, "â"],
      [{ vkey: "K_RBRKT", modifiers: [] }, "á"],
      [{ vkey: "K_COLON", modifiers: [] }, "ã"],
    ];
    for (const [key, expected] of expectations) {
      const result = simulate(compiled, [key], { text: decomposedBase });
      expect(result.finalOutput).toBe(expected);
    }
  }, 30_000);

  it("preempts an existing fallback whose OWN key part is a multi-member any() store (km-qc finding on #1774)", async () => {
    // findInsertionPoint must resolve an existing fallback rule's key part
    // via resolveKeyPartCandidates, not resolveKeyPart's first-member
    // shortcut: the fallback here (`any(key.all) > U+00B4`) matches its
    // SECOND member (']', the same key the gap rule's own fix is keyed on).
    // Resolving only the first member ('[') would never recognise this as a
    // conflicting fallback, so the generated fix could land after it in
    // rule order — the exact silent-shadowing shape #1753 fixed on the
    // generation side, reproduced here on the fallback-detection side.
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "store(key.all) '[' ']' ';'",
      "",
      "any(base) + any(key.act) > index(acute,1)",
      "any(key.all) > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "multi_key_fallback_fixture");
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
    const result = simulate(compiled, [{ vkey: "K_RBRKT", modifiers: [] }], { text: "à" });
    // Must be the tolerant rule's output, never the bare fallback's literal acute-accent mark.
    expect(result.finalOutput).not.toContain("´");
    expect(result.finalOutput).toBe("â");
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

// ---------------------------------------------------------------------------
// Backspace unwrap vs. mnemonic layouts. `[K_BKSP]` in a mnemonic layout is a
// hard kmcmplib error for KeymanWeb targets
// (ERROR_VirtualKeysNotValidForMnemonicLayouts, 0x502058), so the generator
// must not emit it there — but a desktop-only mnemonic keyboard compiles it
// fine and keeps the unwrap. Positional-layout unwrap emission is covered by
// the addBackspaceUnwrap (US4) describe block above.
// ---------------------------------------------------------------------------

describe("proposeContextVariants — backspace unwrap on mnemonic layouts", () => {
  const hasBkspRule = (ir: KeyboardIR): boolean =>
    ir.groups.some((g) =>
      g.rules.some((r) => r.context.some((el) => el.kind === "vkey" && el.name === "K_BKSP")),
    );

  it("skips the [K_BKSP] unwrap for a mnemonic keyboard that targets the web, and says why", async () => {
    const { ir } = parse(GAP_KMN, "mnemonic_web");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr, variants, notes } = await proposeContextVariants(ir, report);

    expect(variants.some((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX))).toBe(false);
    expect(hasBkspRule(fixedIr)).toBe(false);
    expect(notes).toEqual([BACKSPACE_UNWRAP_SKIPPED_MNEMONIC_WEB_NOTE]);
    // The diacritic fix is still generated, and the result compiles clean.
    expect(variants.length).toBeGreaterThan(0);
    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);
    expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  }, 30_000);

  it("keeps the unwrap for a desktop-only mnemonic keyboard, whose build accepts [K_BKSP]", async () => {
    const desktopKmn = GAP_KMN.replace("store(&TARGETS) 'any'", "store(&TARGETS) 'desktop'");
    expect(desktopKmn).not.toBe(GAP_KMN);
    const { ir } = parse(desktopKmn, "mnemonic_desktop");
    const report = await computeContextTolerance(ir);
    const { ir: fixedIr, variants, notes } = await proposeContextVariants(ir, report);

    expect(variants.some((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX))).toBe(true);
    expect(hasBkspRule(fixedIr)).toBe(true);
    expect(notes).toBeUndefined();
    const compiled = await compileIr(fixedIr);
    expect(compiled.success).toBe(true);
  }, 30_000);

  it("adds no note when there is nothing to unwrap", async () => {
    const kmn = [HEADER, "group(main) using keys", "", "+ 'a' > 'a'", ""].join("\n");
    const { ir } = parse(kmn, "mnemonic_web_nothing");
    const report = await computeContextTolerance(ir);
    const { notes } = await proposeContextVariants(ir, report);
    expect(notes).toBeUndefined();
  }, 30_000);
});
