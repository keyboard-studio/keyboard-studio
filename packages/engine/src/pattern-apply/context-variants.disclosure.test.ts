import { describe, it, expect } from "vitest";
import { parse } from "../codec/parse.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants, BACKSPACE_UNWRAP_RULE_PREFIX } from "./context-variants.js";

const HEADER = [
  "store(&NAME) 'ContextVariantsDisclosure'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

const MNEMONIC_HEADER = [
  "store(&NAME) 'ContextVariantsDisclosureMnemonic'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'desktop'",
  "store(&mnemoniclayout) '1'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

describe("proposeContextVariants — VariantDisclosure (spec 078, research D9)", () => {
  it("reports a non-fallback overlapping rule on the same key in shadows, alongside the bare fallback", async () => {
    // Three rules on the same key ([K_RBRKT] / ']'):
    //  - the diagnosed gap rule (any(base) + any(key.act) > index(acute,1))
    //  - a non-fallback overlap: a DIFFERENT specific context on the same key
    //  - a bare fallback (+ ']' > ...)
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "store(base) U+00E0",
      "store(acute) U+00E2",
      "store(key.act) ']'",
      "",
      "any(base) + any(key.act) > index(acute,1)",
      "'z' + any(key.act) > 'q'",
      "+ ']' > U+00B4",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "disclosure_overlap");
    const report = await computeContextTolerance(ir);
    const { variants, disclosures } = await proposeContextVariants(ir, report);

    const targetVariant = variants.find((v) => !v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
    expect(targetVariant).toBeDefined();

    const disclosure = disclosures[targetVariant!.generatedMarker];
    expect(disclosure).toBeDefined();

    const relations = disclosure!.shadows.map((s) => s.relation);
    const fallbackEntries = disclosure!.shadows.filter((s) => s.fallback);
    const nonFallbackEntries = disclosure!.shadows.filter((s) => !s.fallback);

    expect(fallbackEntries.length).toBeGreaterThan(0);
    expect(fallbackEntries.every((s) => s.relation === "shadowed-by")).toBe(true);
    expect(nonFallbackEntries.length).toBeGreaterThan(0);
    expect(relations.length).toBe(fallbackEntries.length + nonFallbackEntries.length);
  }, 30_000);

  it("marks a &mnemoniclayout keyboard's backspace-unwrap sites unobservable", async () => {
    const kmn = [
      MNEMONIC_HEADER,
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
    const { ir } = parse(kmn, "disclosure_mnemonic_bksp");
    const report = await computeContextTolerance(ir);
    const { variants, disclosures } = await proposeContextVariants(ir, report);

    const bkspVariants = variants.filter((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
    expect(bkspVariants.length).toBeGreaterThan(0);
    for (const v of bkspVariants) {
      expect(disclosures[v.generatedMarker]?.unobservable).toBe("mnemonic-backspace");
    }
  }, 30_000);

  it("gives a two-class mark stack a markOrderNote", async () => {
    // U+1EC7 "e with circumflex and dot below" -> NFD [e, dot-below (ccc 220),
    // circumflex (ccc 230)] -- two different combining classes.
    const kmn = [
      HEADER,
      "group(main) using keys",
      "",
      "+ 'x' > U+1EC7",
      "",
    ].join("\n");
    const { ir } = parse(kmn, "disclosure_mark_order");
    const report = await computeContextTolerance(ir);
    const { variants, disclosures } = await proposeContextVariants(ir, report);

    const bkspVariants = variants.filter((v) => v.sourceRuleId.startsWith(BACKSPACE_UNWRAP_RULE_PREFIX));
    expect(bkspVariants.length).toBeGreaterThan(0);
    const withNote = bkspVariants.filter((v) => disclosures[v.generatedMarker]?.markOrderNote !== undefined);
    expect(withNote.length).toBeGreaterThan(0);
    expect(withNote[0] && disclosures[withNote[0].generatedMarker]?.markOrderNote).toContain("ệ");
  }, 30_000);
});
