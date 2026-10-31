import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR, KvksIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  checkIso6395Collective,
  checkNumericRegionContrastive,
  primaryLanguageSubtag,
} from "./check-bcp47.js";
import { checkKpsFontMissing, requiredFontFamilies } from "./check-kps-fonts.js";
import {
  checkMandatedCurrencyChars,
  mandatedCurrencyGaps,
} from "./check-currency.js";

describe("checkIso6395Collective (12.2)", () => {
  it("flags a collective code used as a language", () => {
    const { findings } = checkIso6395Collective(["aus", "ewo-CM"], "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_ISO_639_5_LANG_CODE");
    expect(findings[0]!.message).toContain("aus");
    expect(findings[0]!.message).not.toContain("ewo");
  });

  it("matches case-insensitively on the primary subtag only", () => {
    expect(primaryLanguageSubtag("AUS-AU")).toBe("aus");
    expect(checkIso6395Collective(["AUS"], "demo").findings).toHaveLength(1);
    // A collective code in a non-primary position is not the language.
    expect(checkIso6395Collective(["en-aus"], "demo").findings).toEqual([]);
  });

  it("passes individual language codes", () => {
    expect(checkIso6395Collective(["ewo", "fra", "eng-US"], "demo").findings).toEqual([]);
  });
});

describe("checkNumericRegionContrastive (12.3)", () => {
  it("flags a numeric region with no attestation", () => {
    const { findings } = checkNumericRegionContrastive(["es-419"], "demo", false);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE");
  });

  it("passes a numeric region with the author's attestation", () => {
    expect(checkNumericRegionContrastive(["es-419"], "demo", true).findings).toEqual([]);
  });

  it("passes when no tag uses a numeric region, attested or not", () => {
    expect(checkNumericRegionContrastive(["ewo-CM"], "demo", false).findings).toEqual([]);
    expect(checkNumericRegionContrastive(["ewo-CM"], "demo", true).findings).toEqual([]);
  });
});

describe("checkKpsFontMissing (8.7)", () => {
  const kvks = (fontFamily?: string): KvksIR => ({
    layers: [],
    usealtgr: false,
    nodeIds: [],
    ...(fontFamily !== undefined ? { fontFamily } : {}),
  });
  const touch = (family: string): TouchLayoutIR => ({
    platforms: [{ id: "tablet", font: family, layers: [] }],
    nodeIds: [],
  });

  it("collects required families from the .kvks and the touch platforms, deduplicated", () => {
    expect(
      requiredFontFamilies({ kvks: kvks("Charis SIL"), touchLayout: touch("charis sil") }),
    ).toEqual(["Charis SIL"]);
    expect(
      requiredFontFamilies({ kvks: kvks("Charis SIL"), touchLayout: touch("Andika") }),
    ).toEqual(["Charis SIL", "Andika"]);
  });

  it("passes when every required family is bundled (case-insensitive)", () => {
    expect(
      checkKpsFontMissing({
        kvks: kvks("Andika Afr"),
        bundledFamilies: ["andika afr"],
        keyboardId: "demo",
      }).findings,
    ).toEqual([]);
  });

  it("does not require industry/system fonts (Arial) to be bundled", () => {
    expect(
      checkKpsFontMissing({
        kvks: kvks("Arial"),
        touchLayout: touch("Times New Roman"),
        bundledFamilies: [],
        keyboardId: "demo",
      }).findings,
    ).toEqual([]);
  });

  it("flags a required family with no bundled font", () => {
    const { findings } = checkKpsFontMissing({
      kvks: kvks("Andika Afr"),
      bundledFamilies: ["Charis SIL"],
      keyboardId: "demo",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_KPS_FONT_MISSING");
    expect(findings[0]!.message).toContain("Andika Afr");
  });

  it("flags when nothing is bundled at all, and is silent when no family is required", () => {
    expect(
      checkKpsFontMissing({
        kvks: kvks("Andika Afr"),
        bundledFamilies: [],
        keyboardId: "demo",
      }).findings,
    ).toHaveLength(1);
    expect(
      checkKpsFontMissing({ kvks: kvks(), bundledFamilies: [], keyboardId: "demo" }).findings,
    ).toEqual([]);
  });
});

describe("checkMandatedCurrencyChars (18.7)", () => {
  function irProducing(text: string): KeyboardIR {
    return makeTestIR({
      header: { keyboardId: "demo" },
      groups: [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r1",
              context: [],
              output: [{ kind: "char", value: text }],
            },
          ],
        },
      ],
    });
  }

  it("passes when the region's currency symbol is producible", () => {
    // Cameroon: XAF, symbol "FCFA" — all ASCII letters.
    expect(mandatedCurrencyGaps(irProducing("FCFA"), ["ewo-CM"])).toEqual([]);
    expect(checkMandatedCurrencyChars(irProducing("FCFA"), ["ewo-CM"], "demo").findings).toEqual([]);
  });

  it("flags the missing constituent characters by region", () => {
    // Ghana: GHS, symbol "GH₵" — the cedi sign U+20B5 is the gap.
    const gaps = mandatedCurrencyGaps(irProducing("GH"), ["aka-GH"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ region: "GH", currencyCode: "GHS", symbol: "GH₵" });
    expect(gaps[0]!.missingChars).toEqual(["₵"]);
    const { findings } = checkMandatedCurrencyChars(irProducing("GH"), ["aka-GH"], "demo");
    expect(findings[0]!.code).toBe("KM_LINT_MANDATED_CHAR_MISSING");
  });

  it("passes once the missing character is producible", () => {
    expect(mandatedCurrencyGaps(irProducing("GH₵"), ["aka-GH"])).toEqual([]);
  });

  it("is silent for regionless tags and for regions with no CLDR entry (assembly names those)", () => {
    expect(mandatedCurrencyGaps(irProducing(""), ["ewo"])).toEqual([]);
    expect(mandatedCurrencyGaps(irProducing(""), ["und-XX"])).toEqual([]);
  });
});
