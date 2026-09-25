// Regression lock for FR-010's refusal completeness (spec 078 T027): every
// hazard shape below must surface in `computeContextTolerance`'s report as
// `not-analysed` with a reason, and must never reach `proposeContextVariants`
// as a generated DIACRITIC fix. One exception, explicitly NOT a refusal (per
// spec 078's resolved interpretation, PR #1774): a multi-member key store
// selecting a DIFFERENT physical key per member, paired with a key-position
// index() output — that shape expands per member into literal-key rules
// instead.
//
// `proposeContextVariants` also unconditionally runs the backspace-unwrap
// generator (spec 062 US4) over every decomposable char anywhere in a
// keyboard's stores/outputs, independent of the diagnostic's gap findings —
// every fixture below is filtered to its DIACRITIC variants (excluding
// `BACKSPACE_UNWRAP_RULE_PREFIX`) so that unrelated generator is not mistaken
// for a hazard-shape fix.

import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants, BACKSPACE_UNWRAP_RULE_PREFIX } from "./context-variants.js";

const HEADER = [
  "store(&NAME) 'ContextVariantsRefusal'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

async function analyse(kmn: string, id: string) {
  const { ir } = parse(kmn, id);
  const report = await computeContextTolerance(ir);
  const { ir: fixedIr, variants } = await proposeContextVariants(ir, report);
  const diacriticVariants = variants.filter((v) => !v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
  return { ir, fixedIr, report, variants, diacriticVariants };
}

describe("FR-010 refusal completeness", () => {
  it("refuses a compound key part (more than one element after '+')", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "",
      "any(base) + 'y' 'z' > 'q'",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_compound_key");

    const finding = report.findings.find((f) => f.notAnalysedReason?.includes("compound key part"));
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses notany() in the preceding context", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(key.act) ']'",
      "",
      "notany(base) + any(key.act) > 'q'",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_notany_context");

    const finding = report.findings.find((f) => f.notAnalysedReason?.includes("notany"));
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses notany() as the key part", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(nope) 'q'",
      "",
      "any(base) + notany(nope) > 'q'",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_notany_key");

    const finding = report.findings.find((f) => f.notAnalysedReason?.includes("notany"));
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses context-indexed output beyond the simple pairing the generator measures", async () => {
    // Only two wildcard positions exist in this rule's own context (base@1,
    // key.act@2); index(mystore,3) references a position that does not
    // exist, so the store-pairing analysis cannot resolve it.
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(mystore) U+00E2",
      "store(key.act) ']'",
      "",
      "any(base) + any(key.act) > index(mystore,3)",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_context_indexed_output");

    const finding = report.findings.find((f) => f.notAnalysedReason?.includes("index() output pairing"));
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses a store mixing characters and deadkeys under one any() reference", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(mixed) U+00E0 dk(1)",
      "store(key.act) ']'",
      "",
      "any(mixed) + any(key.act) > 'q'",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_deadkey_mixed_store");

    const finding = report.findings.find((f) => f.notAnalysedReason?.includes("mixes characters and deadkeys"));
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses a rule guarded by if() (the codec opaques it entirely — never reaches a typed rule)", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(&opt) '0'",
      "",
      "if(&opt = '1') + 'y' > 'z'",
      "",
    ].join("\n");
    const { ir, report, diacriticVariants } = await analyse(kmn, "refusal_if_guard");

    expect(ir.raw.length).toBeGreaterThan(0);
    expect(report.findings.length + report.notAnalysedCount).toBe(
      ir.groups.reduce((n, g) => n + g.rules.length, 0) + ir.raw.length,
    );
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses a rule guarded by platform() (parsed as an unmodelled context element, not opaque)", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "platform('windows') + 'y' > 'z'",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_platform_guard");

    const finding = report.findings.find((f) => f.notAnalysedReason !== undefined);
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("refuses a rule guarded by baselayout()", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "baselayout('en-US') + 'y' > 'z'",
      "",
    ].join("\n");
    const { report, diacriticVariants } = await analyse(kmn, "refusal_baselayout_guard");

    const finding = report.findings.find((f) => f.notAnalysedReason?.includes("baselayout"));
    expect(finding).toBeDefined();
    expect(finding?.status).toBe("not-analysed");
    expect(diacriticVariants).toHaveLength(0);
  }, 30_000);

  it("never touches an opaque rule the codec could not model", async () => {
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "U+1F600 + 'y' > 'z'",
      "store(base) U+00E0",
      "store(key.act) ']'",
      "any(base) + any(key.act) > 'q'",
      "",
    ].join("\n");
    const { ir, variants } = await analyse(kmn, "refusal_opaque_rule");

    expect(ir.raw).toHaveLength(1);
    // The opaque rule contributes no finding at all — never touched.
    expect(variants.some((v) => v.sourceRuleId === ir.raw[0]!.nodeId)).toBe(false);
  }, 30_000);

  it("does NOT refuse a multi-member key store with key-position index() output — expands per member instead", async () => {
    // Mirrors sil_yoruba8's real shape: any(context) + any(key.all) >
    // index(context,1) index(ac.all,2) — a valid, resolved pairing (position 1
    // is the context store itself; position 2 is the key store, and ac.all is
    // its accented-output counterpart). Must NOT be refused; must expand into
    // one literal-key rule per member (#1753/#1774), never a copied any().
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(dotbase) U+1ECD",
      "store(key.all) '1' '2'",
      "store(ac.all) 'p' 'q'",
      "",
      "any(dotbase) + any(key.all) > index(dotbase,1) index(ac.all,2)",
      "",
    ].join("\n");
    const { report, fixedIr, diacriticVariants } = await analyse(kmn, "not_refused_multi_member_key_store");

    const hazardFinding = report.findings.find(
      (f) =>
        f.notAnalysedReason?.includes("index() output pairing") ||
        f.notAnalysedReason?.includes("paired via index() with more than one other store"),
    );
    expect(hazardFinding).toBeUndefined();

    // Every generated rule's key part must be a single literal key — never a
    // copied multi-member any().
    const main = fixedIr.groups.find((g) => g.name === "main")!;
    for (const variant of diacriticVariants) {
      const generated = main.rules.find((r) => r.nodeId === variant.generatedMarker);
      expect(generated).toBeDefined();
      const plusIdx = generated!.context.findIndex((el) => el.kind === "raw" && el.text === "+");
      const keyPart = generated!.context.slice(plusIdx + 1);
      expect(keyPart).toHaveLength(1);
      expect(keyPart[0]!.kind === "char" || keyPart[0]!.kind === "vkey").toBe(true);
    }

    // One variant per key.all member ('1' -> 'p', '2' -> 'q'), each keeping
    // the SAME decomposed base candidate ("ọ") and its OWN member's accent.
    expect(diacriticVariants).toHaveLength(2);
    const outputs = diacriticVariants.map((v) => v.precomposedOutput).sort();
    expect(outputs).toEqual(["ọp", "ọq"].sort());
  }, 30_000);
});
