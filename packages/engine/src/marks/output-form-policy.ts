// Output-form proposal (spec 046, FR-013..FR-016): ONE whole-keyboard decision
// — ready-made single characters vs base-plus-mark sequences — computed from
// the shared posture table (nfc-posture-of-inventory.ts) as an ordered,
// first-match-wins decision table with authored explanation text and a
// mandatory default row, modeled on facet-transform/house-target-policy.ts
// (ordered rows, first-match-wins, authored explanation, mandatory default)
// with simpler predicate matching.
//
// Designer-facing constraint (SC-005): no explanation below may contain the
// words "Unicode" or "normalization" — asserted mechanically in tests.

import type { PosturePair } from "./nfc-posture-of-inventory.js";

export type OutputForm = "ready-made" | "base-plus-mark";

export interface OutputFormProposal {
  form: OutputForm;
  /** Which FR branch fired: a pre-explained notice, or the open FR-016 choice. */
  presentedAs: "notice" | "open-choice";
  /** Plain-language reason shown with the proposal (consequence-led, no jargon). */
  explanation: string;
}

interface OutputFormPolicyRow {
  order: number;
  matches: (inputs: OutputFormInputs) => boolean;
  result: OutputFormProposal;
  isDefault: boolean;
}

export interface OutputFormInputs {
  /** True when at least one attested/accepted pair has NO ready-made form. */
  anyPairLacksReadyMade: boolean;
  /** True when at least one mark-class was confirmed as letter-plus-mark. */
  hasLetterPlusMarkClass: boolean;
}

/**
 * The ordered policy. Row 1 (FR-014): any pair without a ready-made form
 * forces base-plus-mark for the WHOLE keyboard, as a notice. Row 2 (FR-016):
 * everything composes but the community treats a mark as productive — both
 * forms are viable, so the decision renders as an open choice with
 * base-plus-mark recommended first. Row 3 (FR-015, default): everything
 * composes and every marked letter is its own letter — ready-made, as a notice.
 */
const OUTPUT_FORM_POLICY: readonly OutputFormPolicyRow[] = [
  {
    order: 1,
    matches: (i) => i.anyPairLacksReadyMade,
    result: {
      form: "base-plus-mark",
      presentedAs: "notice",
      explanation:
        "Some of your accented letters have no single ready-made character, so " +
        "your keyboard will build every accented letter from its letter plus its " +
        "mark. Doing it the same way for all letters keeps searching and " +
        "backspace behavior consistent across your whole keyboard.",
    },
    isDefault: false,
  },
  {
    order: 2,
    matches: (i) => i.hasLetterPlusMarkClass,
    result: {
      form: "base-plus-mark",
      presentedAs: "open-choice",
      explanation:
        "Both ways can work for your alphabet. Building letters from letter plus " +
        "mark matches how your marks attach to many letters, and backspace peels " +
        "one mark off at a time. Ready-made characters make each accented letter " +
        "a single unit that backspace removes in one step.",
    },
    isDefault: false,
  },
  {
    order: 3,
    matches: () => true,
    result: {
      form: "ready-made",
      presentedAs: "notice",
      explanation:
        "Every accented letter in your alphabet has a single ready-made " +
        "character, and your community treats each one as its own letter — so " +
        "your keyboard will produce those ready-made characters. Backspace " +
        "removes a whole accented letter in one step.",
    },
    isDefault: true,
  },
];

/**
 * Resolve the whole-keyboard output-form proposal from the posture table and
 * the mental-model outcome. First-match-wins over the ordered rows; the table
 * ends in a mandatory default, so this always returns.
 */
export function resolveOutputFormProposal(
  posture: PosturePair[],
  hasLetterPlusMarkClass: boolean,
): OutputFormProposal {
  const inputs: OutputFormInputs = {
    anyPairLacksReadyMade: posture.some((p) => !p.hasReadyMadeForm),
    hasLetterPlusMarkClass,
  };
  for (const row of OUTPUT_FORM_POLICY) {
    if (row.matches(inputs)) return row.result;
  }
  // Unreachable: the last row always matches.
  throw new Error("resolveOutputFormProposal: no policy row matched (missing default row)");
}

/**
 * Whether the output-form station has anything to decide at all: zero
 * decidable pairs (no attested/accepted stacks) means the station must not
 * render (spec edge case — "there is nothing to decide").
 */
export function hasDecidablePairs(posture: PosturePair[]): boolean {
  return posture.length > 0;
}
