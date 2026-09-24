import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import {
  proposeContextVariants,
  GENERATED_MARKER_PREFIX,
  BACKSPACE_UNWRAP_RULE_PREFIX,
  BACKSPACE_UNWRAP_SKIPPED_MNEMONIC_WEB_NOTE,
} from "./context-variants.js";

const HEADER = [
  "store(&NAME) 'ContextVariants'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

async function compileIr(ir: KeyboardIR) {
  const vfs = createVirtualFS([
    { path: `source/${ir.header.keyboardId}.kmn`, content: emit(ir), isBinary: false },
  ]);
  return compile(vfs, ir.header.keyboardId);
}

// Mirrors sil_yoruba8's real acute-table shape: a store-backed diacritic rule
// plus an existing bare-key fallback that must NOT fire once the generated
// rule is present (Story 1 Acceptance Scenario 3).
const GAP_KMN = [
  HEADER,
  "group(main) using keys",
  "",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

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
// Backspace unwrap vs. mnemonic layouts. `[K_BKSP]` in a mnemonic layout is a
// hard kmcmplib error for KeymanWeb targets
// (ERROR_VirtualKeysNotValidForMnemonicLayouts, 0x502058), so the generator
// must not emit it there — but a desktop-only mnemonic keyboard compiles it
// fine and keeps the unwrap. Positional-layout unwrap emission is covered in
// context-variants.backspaceUnwrap.test.ts.
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
