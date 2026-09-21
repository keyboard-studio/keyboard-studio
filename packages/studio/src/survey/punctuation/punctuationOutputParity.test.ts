// punctuationOutputParity — SC-007 (spec 075): the emitted keyboard's
// punctuation set minus the confirmed punctuation inventory is empty.
//
// The punctuation step now seeds every punctuation character the base
// produces (the base group), so with zero interaction the confirmed inventory
// already covers everything the emitted `.kmn` types. The difference can only
// be non-empty where the author REMOVED a base-produced mark and carve's
// always-keep rule for \p{N}\p{P}\p{S} re-admitted it to the layout — the
// deferred carve-side concern the plan records. This test names that character
// when it happens, so the disagreement stays visible instead of silently
// passing.
//
// Fixture: a small real `.kmn` parsed through the codec (the same parse →
// KeyboardIR → producedGlyphs path the working copy takes), rather than the
// Playwright copy-edit fixture, whose base lives in the sibling ../keyboards
// checkout and is out of reach for a unit test.

import { describe, expect, it, beforeEach } from "vitest";
import { basePunctuationCoverage, glyphCategory, parseKmn, producedGlyphs } from "@keyboard-studio/engine";
import { usePhaseBDraftStore, resetPhaseBDraftDecisions } from "../../stores/phaseBDraftStore.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";

const PARITY_KMN = [
  "store(&NAME) 'Parity'",
  "store(&VERSION) '10.0'",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "+ [K_PERIOD] > '.'",
  "+ [K_COMMA] > ','",
  "+ [SHIFT K_1] > '!'",
  "+ [SHIFT K_SLASH] > '?'",
  "+ [K_A] > 'a'",
  "+ [K_4] > '$'",
  "",
].join("\n");

function emittedPunctuation(ir: ReturnType<typeof parseKmn>["ir"]): string[] {
  return producedGlyphs(ir)
    .map((c) => c.normalize("NFC"))
    .filter((c) => glyphCategory(c) === "punctuation");
}

function confirmedPunctuation(): Set<string> {
  return new Set(phaseCConfirmedInventory().filter((c) => glyphCategory(c) === "punctuation"));
}

beforeEach(() => {
  usePhaseBDraftStore.getState().reset();
  resetPhaseBDraftDecisions();
});

describe("SC-007 — emitted punctuation ⊆ confirmed punctuation inventory", () => {
  it("with zero interaction, every punctuation character the keyboard emits is in the confirmed inventory", () => {
    const { ir } = parseKmn(PARITY_KMN, "parity");
    const coverage = basePunctuationCoverage(ir);
    expect(coverage.coverageComplete).toBe(true);
    expect([...coverage.produced].sort()).toEqual([",", ".", "!", "?"].sort());

    // What the punctuation step seeds on arrival for this base.
    usePhaseBDraftStore.getState().seedProposals(coverage.produced, "base", "punctuation-base:parity");

    const confirmed = confirmedPunctuation();
    const difference = emittedPunctuation(ir).filter((c) => !confirmed.has(c));
    expect(difference).toEqual([]);
    // `$` is a symbol, not punctuation — outside both sides of the comparison.
    expect(confirmed.has("$")).toBe(false);
  });

  it("names the character carve's always-keep rule re-admits after the author declined it (deferred carve-side concern)", () => {
    const { ir } = parseKmn(PARITY_KMN, "parity");
    const coverage = basePunctuationCoverage(ir);
    usePhaseBDraftStore.getState().seedProposals(coverage.produced, "base", "punctuation-base:parity");
    usePhaseBDraftStore.getState().remove("?");
    expect(usePhaseBDraftStore.getState().rejected).toEqual(["?"]);

    // The emitted keyboard is the working copy unchanged — carve's always-keep
    // rule never removes punctuation — so the declined mark is still typed.
    const confirmed = confirmedPunctuation();
    const difference = emittedPunctuation(ir).filter((c) => !confirmed.has(c));
    expect(difference).toEqual(["?"]);
  });
});
