// buildCriteriaInventory — the §18.6 inventory builder (spec 084 Batch 4).
//
// Pins Matthew's construction: confirmed decisions UNIONED with the
// per-target CLDR/SLDR exemplar baseline; the ruling's only skip (any
// target with no entry, or no target at all); honest field assignment;
// and the multi-codepoint rule — clusters contribute constituents,
// never a whole string the produced set cannot contain.

import { describe, expect, it } from "vitest";
import { linguistInventoryChars, makeConfirmedAlphabet } from "@keyboard-studio/contracts";

import type { SourcedInventory } from "../lib/services.ts";
import { buildCriteriaInventory } from "./buildCriteriaInventory.ts";

function sourced(
  tag: string,
  chars: ReadonlyArray<{ char: string; tier: "main" | "auxiliary" | "punctuation" | "numbers" }>,
  digraphs: string[] = [],
): SourcedInventory {
  return {
    resolvedTag: tag,
    source: "cldr",
    confidence: "approved",
    characters: chars.map(({ char, tier }) => ({
      char,
      tier,
      source: "cldr" as const,
      confidence: "approved" as const,
    })),
    digraphs,
  };
}

/** Ewondo-shaped baseline: schwa with a non-precomposable acute unit, aux letters, digits. */
function ewoBaseline(): SourcedInventory {
  return sourced("ewo", [
    { char: "a", tier: "main" },
    { char: "ə", tier: "main" },
    { char: "ə́", tier: "main" }, // schwa + U+0301, no precomposed form
    { char: "c", tier: "auxiliary" },
    { char: ".", tier: "punctuation" },
    { char: "5", tier: "numbers" },
  ], ["dz"]);
}

function build(overrides: Partial<Parameters<typeof buildCriteriaInventory>[0]> = {}) {
  return buildCriteriaInventory({
    languageTags: ["ewo"],
    script: "Latin",
    confirmed: { confirmedInventory: [] },
    sourcedByTag: new Map([["ewo", ewoBaseline()]]),
    ...overrides,
  });
}

describe("buildCriteriaInventory", () => {
  it("builds from the baseline alone when the author confirmed nothing yet", () => {
    const result = build();
    expect(result.kind).toBe("built");
    if (result.kind !== "built") return;
    const chars = linguistInventoryChars(result.inventory);
    expect(chars).toContain("a");
    expect(chars).toContain("ə");
    expect(chars).toContain(".");
    expect(chars).toContain("5");
    expect(result.inventory.language).toBe("ewo");
    expect(result.inventory.alphabetAuxiliary?.lowercase).toContain("c");
  });

  it("splits a non-precomposable exemplar unit into its constituents", () => {
    const result = build();
    if (result.kind !== "built") throw new Error("expected built");
    const chars = linguistInventoryChars(result.inventory);
    // The unit "ə́" must not appear whole (it can never equal a produced
    // codepoint); its mark must be required on its own.
    expect(chars).not.toContain("ə́");
    expect(result.inventory.mandatoryDiacriticsAndLigatures).toContain("́");
    expect(chars.every((c) => [...c].length === 1)).toBe(true);
  });

  it("omits digraphs (their letters are required via the alphabet)", () => {
    const result = build();
    if (result.kind !== "built") throw new Error("expected built");
    expect(linguistInventoryChars(result.inventory)).not.toContain("dz");
  });

  it("unions the author's confirmed decisions over the baseline", () => {
    const result = build({
      confirmed: {
        alphabet: makeConfirmedAlphabet({
          bases: ["ŋ"],
          marks: ["̃"],
          attestedStacks: [{ base: "o", marks: ["́"] }], // ó, precomposed
        }),
        confirmedInventory: ["ŋ", "€"],
      },
    });
    if (result.kind !== "built") throw new Error("expected built");
    const chars = linguistInventoryChars(result.inventory);
    expect(chars).toContain("ŋ"); // confirmed base the baseline lacks
    expect(result.inventory.mandatoryDiacriticsAndLigatures).toContain("ó"); // precomposed stack lands as its own unit
    expect(result.inventory.mandatoryDiacriticsAndLigatures).toContain("̃"); // confirmed lone mark
    expect(result.inventory.languageSpecificPunctuation).toContain("€");
  });

  it("case-splits the core alphabet", () => {
    const result = build({
      sourcedByTag: new Map([
        ["ewo", sourced("ewo", [
          { char: "a", tier: "main" },
          { char: "A", tier: "main" },
          { char: "Ŋ", tier: "main" },
        ])],
      ]),
    });
    if (result.kind !== "built") throw new Error("expected built");
    expect(result.inventory.alphabetCore.lowercase).toContain("a");
    expect(result.inventory.alphabetCore.uppercase).toContain("A");
    expect(result.inventory.alphabetCore.uppercase).toContain("Ŋ");
  });

  it("skips the whole build when ANY target has no CLDR/SLDR entry", () => {
    const result = build({
      languageTags: ["ewo", "xyz"],
      sourcedByTag: new Map<string, SourcedInventory | null>([
        ["ewo", ewoBaseline()],
        ["xyz", null],
      ]),
    });
    expect(result).toEqual({ kind: "skipped", missingTag: "xyz" });
  });

  it("skips when there is no language target at all", () => {
    const result = build({ languageTags: [], sourcedByTag: new Map() });
    expect(result).toEqual({ kind: "skipped", missingTag: null });
  });

  it("classifies declared-role PUA by the author's role and omits undeclared PUA", () => {
    const puaLetter = "\u{E000}";
    const puaUnknown = "\u{E001}";
    const result = build({
      confirmed: {
        alphabet: makeConfirmedAlphabet({
          declaredRoles: { [puaLetter]: "letter" },
        }),
        confirmedInventory: [puaLetter, puaUnknown],
      },
    });
    if (result.kind !== "built") throw new Error("expected built");
    const chars = linguistInventoryChars(result.inventory);
    expect(chars).toContain(puaLetter);
    expect(chars).not.toContain(puaUnknown);
  });
});
