/**
 * punctuationProposal — the "your punctuation is already chosen" proposal.
 *
 * The punctuation step used to start the author from an empty list even
 * though it already knew the locale's CLDR/SLDR punctuation tier and could
 * see what the base keyboard produces. This module computes the two proposed
 * groups that step now seeds on arrival (spec 075):
 *
 *  - the **CLDR group** — the resolved locale's `"punctuation"` exemplar tier;
 *  - the **base group** — punctuation the base keyboard already produces that
 *    the CLDR group does not cover, or, when base output cannot be trusted,
 *    the fixed basic-ASCII floor below.
 *
 * The floor rule is ONE-WAY (FR-007..FR-009): when the base IR carries an
 * opaque fragment whose output is invisible to static analysis, or when no
 * base coverage is available at all, the known set is discarded and the floor
 * stands in for it — the two are never combined, and the caller must say the
 * base set is not fully known rather than present a partial set as complete.
 *
 * Both groups are NFC-deduped and disjoint from each other, from the author's
 * rejections (a removed proposal is never re-proposed, FR-022) and from the
 * author's own picks (never restyled or re-attributed, FR-005). A character in
 * both sources appears once, in the CLDR group; the studio derives "also
 * produced by the base" at render time from `BasePunctuationCoverage`.
 *
 * Sibling of `convenienceChars.ts` (the letters family). Pure, browser-safe,
 * no I/O.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { producedGlyphs } from "../inventory/producedGlyphs.js";
import { hasUnaccountedOpaqueFragment } from "../inventory/computeInventoryDelta.js";
import { glyphCategory } from "./glyphCategory.js";
import type { SourcedInventory } from "./exemplarTypes.js";

// ---------------------------------------------------------------------------
// The basic-ASCII floor
// ---------------------------------------------------------------------------

function codePointRange(from: number, to: number): string[] {
  const out: string[] = [];
  for (let cp = from; cp <= to; cp++) out.push(String.fromCodePoint(cp));
  return out;
}

/**
 * The 32 non-alphanumeric printable ASCII characters — U+0021–U+002F,
 * U+003A–U+0040, U+005B–U+0060, U+007B–U+007E — in code-point order. This is
 * what every physical keyboard's base layout types by fall-through, so it is
 * the honest lower bound when the base's real output cannot be determined.
 * A fixed table by definition, not a General-Category filter: `$`, `+`, `<`
 * and friends are Unicode symbols, not punctuation, and belong here anyway.
 */
export const ASCII_PUNCTUATION_FLOOR: readonly string[] = Object.freeze([
  ...codePointRange(0x21, 0x2f),
  ...codePointRange(0x3a, 0x40),
  ...codePointRange(0x5b, 0x60),
  ...codePointRange(0x7b, 0x7e),
]);

// ---------------------------------------------------------------------------
// Base coverage
// ---------------------------------------------------------------------------

export interface BasePunctuationCoverage {
  /** NFC punctuation (`glyphCategory === "punctuation"`) the base IR statically produces. */
  produced: string[];
  /**
   * False when the IR holds an opaque fragment with no `producedOutput`
   * sketch — the same derivation `computeInventoryDelta` uses, so the two
   * never disagree about whether the base's output is fully known.
   */
  coverageComplete: boolean;
}

/** What punctuation the base keyboard produces, and whether that list is trustworthy. */
export function basePunctuationCoverage(ir: KeyboardIR): BasePunctuationCoverage {
  return {
    produced: nfcUnique(producedGlyphs(ir)).filter((c) => glyphCategory(c) === "punctuation"),
    coverageComplete: !hasUnaccountedOpaqueFragment(ir),
  };
}

// ---------------------------------------------------------------------------
// The proposal
// ---------------------------------------------------------------------------

/** Why the CLDR group is empty, when it is — two different messages for the author. */
export type CldrAbsentReason = "no-exemplars" | "empty-tier";

export interface PunctuationProposalInput {
  /** `useSourcedExemplars(bcp47).inventory` — null when neither source covers the tag. */
  exemplars: SourcedInventory | null;
  /** `basePunctuationCoverage(ir)`, or null when there is no working copy to read. */
  baseCoverage: BasePunctuationCoverage | null;
  /** NFC keys of proposals the author removed (`phaseBDraftStore.rejected`). */
  rejected: ReadonlySet<string>;
  /** NFC keys the author typed or picked themselves (provenance `"author"`). */
  authorChosen: ReadonlySet<string>;
}

export interface PunctuationProposal {
  /** The locale's punctuation tier, NFC, minus rejections and author picks. */
  cldrGroup: string[];
  /** Base-produced punctuation (or the floor), NFC, minus `cldrGroup`, rejections and author picks. */
  baseGroup: string[];
  /** Set only when `cldrGroup` is empty because the source had nothing, not because of filtering. */
  cldrAbsentReason?: CldrAbsentReason;
  /** True iff the floor was substituted for the base's real output. */
  baseCoverageIncomplete: boolean;
}

/** NFC-normalise and dedupe, keeping first-appearance order and dropping empties. */
function nfcUnique(chars: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of chars) {
    const nfc = raw.normalize("NFC");
    if (nfc.length === 0 || seen.has(nfc)) continue;
    seen.add(nfc);
    out.push(nfc);
  }
  return out;
}

/**
 * Build the two proposed groups. See the module header for the invariants;
 * each has a colocated test.
 */
export function buildPunctuationProposal(input: PunctuationProposalInput): PunctuationProposal {
  const { exemplars, baseCoverage, rejected, authorChosen } = input;
  const excluded = (c: string): boolean => rejected.has(c) || authorChosen.has(c);

  const tier =
    exemplars === null
      ? []
      : exemplars.characters.filter((c) => c.tier === "punctuation").map((c) => c.char);
  const cldrGroup = nfcUnique(tier).filter((c) => !excluded(c));
  const cldrSet = new Set(cldrGroup);

  // One-way degradation: the known set is used only when it is fully known;
  // otherwise the floor replaces it outright. Never a union of the two.
  const known = baseCoverage !== null && baseCoverage.coverageComplete;
  const candidates = known ? baseCoverage.produced : ASCII_PUNCTUATION_FLOOR;
  const baseGroup = nfcUnique(candidates).filter((c) => !excluded(c) && !cldrSet.has(c));

  const proposal: PunctuationProposal = { cldrGroup, baseGroup, baseCoverageIncomplete: !known };
  if (exemplars === null) proposal.cldrAbsentReason = "no-exemplars";
  else if (tier.length === 0) proposal.cldrAbsentReason = "empty-tier";
  return proposal;
}
