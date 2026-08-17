import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { simulate } from "../simulator/index.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants, GENERATED_MARKER_PREFIX, BACKSPACE_UNWRAP_RULE_PREFIX } from "./context-variants.js";

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
